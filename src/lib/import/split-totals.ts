/**
 * Fase 06+ — De QUEM é cada linha de uma importação (lógica PURA, testada em
 * split-totals.test.ts).
 *
 * `totals.ts` responde "quanto o commit vai criar", somando por status. Esta é a outra
 * pergunta — "quanto disso é meu" —, e por isso mora em módulo separado.
 *
 * REGRA CENTRAL
 * -------------
 * Nada aqui reimplementa a divisão: a conta sai de `dividirDespesa` (`src/lib/finance/split.ts`),
 * o MESMO motor que o `commitImport` usa ao gravar, alimentado pela MESMA conversão
 * (`toPartesDivisao`). Uma segunda aritmética faria a revisão prometer um número e a fatura
 * receber outro.
 *
 * Como em `totals.ts`, `import_rows.valor` chega em REAIS e sempre como magnitude positiva (o
 * sentido vai em `tipo`); a soma acontece em CENTAVOS e só volta para reais no fim.
 */
import {
  dividirDespesa,
  toPartesDivisao,
  type ParteEmReais,
} from "@/lib/finance/split";
import { centavosParaReais, reaisParaCentavos } from "@/lib/format";
import type { Classificacao } from "@/lib/finance/constants";
import type { ImportRowStatus } from "@/lib/import/constants";

/** Forma mínima de uma linha para o cálculo (subconjunto de ImportRowWithRelations). */
export type ImportRowSplitInput = {
  status: ImportRowStatus;
  valor: number | null;
  tipo: "despesa" | "receita" | null;
  classificacao: Classificacao;
  split_parts: ParteEmReais[];
};

/** Quanto uma pessoa paga (centavos), resolvido. */
export type ParteResolvida = { personId: string; valorCentavos: number };

export type DivisaoDaLinha =
  | { ok: true; meuCentavos: number; partes: ParteResolvida[] }
  | { ok: false; motivo: string };

/**
 * Resolve a divisão de UMA linha. Devolve a minha parte e a de cada pessoa, em centavos.
 *
 * Casos que não são erro e resolvem para "tudo meu": linha pessoal, linha sem partes e linha de
 * RECEITA — estorno/crédito de fatura não é divisível (nem o `commitImport` o divide: ele vai
 * por `createCardEstorno`). Em receita o valor volta NEGATIVO, para que somar as linhas de um
 * lote dê a minha parte do LÍQUIDO.
 *
 * Devolve `ok: false` quando a divisão não fecha. Isso é possível de verdade:
 * `setImportRowSplit` grava `split_parts` sem conhecer o valor da linha, então as partes podem
 * somar mais que o total (ou o valor da linha pode ter mudado depois no remapeamento). Nesse
 * caso a linha é DECLARADA irresolvível em vez de ser chutada como zero.
 */
export function divisaoDaLinha(row: ImportRowSplitInput): DivisaoDaLinha {
  if (row.valor == null) return { ok: false, motivo: "Linha sem valor." };

  const centavos = reaisParaCentavos(row.valor);
  const sinal = row.tipo === "receita" ? -1 : 1;

  if (
    row.tipo === "receita" ||
    row.classificacao === "pessoal" ||
    row.split_parts.length === 0
  ) {
    return { ok: true, meuCentavos: sinal * centavos, partes: [] };
  }

  try {
    const r = dividirDespesa(centavos, toPartesDivisao(row.split_parts));
    return {
      ok: true,
      meuCentavos: r.minhaParteCentavos,
      partes: r.partesTerceiros,
    };
  } catch {
    return {
      ok: false,
      motivo: "A divisão desta linha não fecha com o valor dela.",
    };
  }
}

/** Quanto uma pessoa paga no lote inteiro, em reais. */
export type ParteDoLote = { personId: string; valor: number };

export type DivisaoDoLote = {
  /** Minha parte do líquido, em reais (estornos já subtraídos). */
  meu: number;
  /** Soma das partes de terceiros, em reais. */
  terceiros: number;
  /** Uma entrada por pessoa (reais), da maior para a menor. */
  porPessoa: ParteDoLote[];
  /** True quando alguma linha não pôde ser resolvida e ficou de fora da conta. */
  parcial: boolean;
  /** Quantas linhas ficaram de fora. */
  naoResolvidas: number;
  /** True quando existe ao menos uma parte de terceiro (a UI só mostra a quebra então). */
  temTerceiros: boolean;
};

/**
 * Divisão do lote inteiro, restrita a um status (default 'para_importar' — exatamente o que o
 * commit vai criar; depois do commit a tela pede 'importada').
 *
 * Linha irresolvível fica FORA dos somatórios e liga `parcial`. Somá-la como se fosse toda
 * minha inflaria a minha parte em silêncio; ignorá-la sem dizer nada faria a soma das partes
 * não bater com o total exibido ao lado. Errar para "pode faltar coisa" é o único erro
 * aceitável aqui — mesma disciplina de `coberturaDaFatura` e do `value_state` da Dieta.
 */
export function divisaoPorStatus(
  rows: ImportRowSplitInput[],
  status: ImportRowStatus = "para_importar",
): DivisaoDoLote {
  let meuC = 0;
  let naoResolvidas = 0;
  const porPessoaC = new Map<string, number>();

  for (const r of rows) {
    if (r.status !== status) continue;
    // Linha sem valor não é falha de divisão: ela já não soma em `totals.ts` e some daqui pelo
    // mesmo motivo. Só entra em `naoResolvidas` a divisão que de fato não fecha.
    if (r.valor == null) continue;

    const d = divisaoDaLinha(r);
    if (!d.ok) {
      naoResolvidas++;
      continue;
    }
    meuC += d.meuCentavos;
    for (const p of d.partes) {
      porPessoaC.set(p.personId, (porPessoaC.get(p.personId) ?? 0) + p.valorCentavos);
    }
  }

  const porPessoa = [...porPessoaC.entries()]
    .map(([personId, c]) => ({ personId, valor: centavosParaReais(c) }))
    .sort((a, b) => b.valor - a.valor);
  const terceirosC = [...porPessoaC.values()].reduce((acc, c) => acc + c, 0);

  return {
    meu: centavosParaReais(meuC),
    terceiros: centavosParaReais(terceirosC),
    porPessoa,
    parcial: naoResolvidas > 0,
    naoResolvidas,
    temTerceiros: porPessoa.length > 0,
  };
}
