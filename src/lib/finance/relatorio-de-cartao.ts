/**
 * REDESIGN-05-C — Relatório de cartões (lógica PURA, testada em relatorio-de-cartao.test.ts).
 * Desenho: docs/superpowers/specs/2026-11-02-05c-proximos-meses-design.md (§7).
 *
 * NENHUM SEGUNDO CÁLCULO: total, minha parte e parte dos terceiros de cada mês saem de
 * `faturasPorMes` (a regra única da fatura, em REAIS) e só são CONVERTIDOS para centavos
 * inteiros e somados aqui. O `DashReceivable` nasce em `montarEntradas` — a fronteira da 03-B
 * proíbe montá-lo à mão (mesmo uso de `central-cartoes.ts`).
 *
 * Ausência não é zero: `faturasPorMes` com `meses` devolve zeros para mês sem fatura, então quem
 * decide se o mês tem valor é a CONTAGEM de faturas reais pela mesma chave de agrupamento.
 * Sem fatura ⇒ `valores: null`; período sem nenhuma ⇒ `totais: null`. Crédito (total < 0) entra
 * com sinal. `hoje` é injetado; sem `Date.now()`.
 */
import {
  type DashReceivable,
  type DashStatement,
  faturasPorMes,
  mesDe,
  ultimosMeses,
} from "@/lib/finance/dashboard";
import type { CartaoDaCentral } from "@/lib/finance/central-cartoes";
import { montarEntradas } from "@/lib/finance/pipeline";
import { reaisParaCentavos } from "@/lib/format";
import type { ReceivableWithPerson } from "@/types/database";

export type BaseDoRelatorio = "competencia" | "vencimento";

/** `?base=` — qualquer valor desconhecido cai em `competencia`. */
export function baseDoRelatorio(bruto: string | undefined): BaseDoRelatorio {
  return bruto === "vencimento" ? "vencimento" : "competencia";
}

/** `?meses=` — só 6 ou 12; qualquer outro valor cai em 12. */
export function periodoDoRelatorio(bruto: string | undefined): 6 | 12 {
  return bruto === "6" ? 6 : 12;
}

export type ValoresDoMes = {
  totalCent: number;
  meuCent: number;
  terceirosCent: number;
  faturas: number;
};

export type RelatorioDeCartao = {
  base: BaseDoRelatorio;
  n: 6 | 12;
  /** 'yyyy-MM', do mais antigo ao mais novo, terminando no mês de `hoje`. */
  meses: string[];
  /** `null` = todos os cartões (id desconhecido também resulta em `null`). */
  cardId: string | null;
  /** `valores: null` = sem fatura neste mês. */
  porMes: { mes: string; valores: ValoresDoMes | null }[];
  /** `null` = nenhuma fatura no período. */
  totais: ValoresDoMes | null;
  /** Só quem teve fatura no período; ativos antes, depois por nome (pt-BR). */
  porCartao: { card: CartaoDaCentral; valores: ValoresDoMes }[];
};

function chaveDoMes(s: DashStatement, base: BaseDoRelatorio): string {
  return mesDe(base === "vencimento" ? s.data_vencimento : s.competencia);
}

/** Valores de cada mês de `meses` para `statements`; mês sem fatura real = `null`. */
function valoresPorMes(
  statements: readonly DashStatement[],
  receivables: DashReceivable[],
  meses: string[],
  base: BaseDoRelatorio,
): (ValoresDoMes | null)[] {
  const contagem = new Map<string, number>();
  for (const s of statements) {
    const chave = chaveDoMes(s, base);
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  const reais = faturasPorMes({
    statements: [...statements],
    receivables,
    meses,
    agrupar: base,
  });
  return reais.map((f) => {
    const faturas = contagem.get(f.mes) ?? 0;
    if (faturas === 0) return null;
    return {
      totalCent: reaisParaCentavos(f.total),
      meuCent: reaisParaCentavos(f.meu),
      terceirosCent: reaisParaCentavos(f.terceiros),
      faturas,
    };
  });
}

/** Soma os meses não nulos; `null` se não houver nenhum. */
function somar(valores: readonly (ValoresDoMes | null)[]): ValoresDoMes | null {
  const reais = valores.filter((v): v is ValoresDoMes => v !== null);
  if (reais.length === 0) return null;
  return reais.reduce<ValoresDoMes>(
    (acc, v) => ({
      totalCent: acc.totalCent + v.totalCent,
      meuCent: acc.meuCent + v.meuCent,
      terceirosCent: acc.terceirosCent + v.terceirosCent,
      faturas: acc.faturas + v.faturas,
    }),
    { totalCent: 0, meuCent: 0, terceirosCent: 0, faturas: 0 },
  );
}

export function montarRelatorioDeCartao(p: {
  hoje: string;
  base: BaseDoRelatorio;
  n: 6 | 12;
  cardId: string | undefined;
  cards: readonly CartaoDaCentral[];
  statements: readonly DashStatement[];
  receivables: readonly ReceivableWithPerson[];
}): RelatorioDeCartao {
  const { hoje, base, n, cards, receivables } = p;
  const meses = ultimosMeses(mesDe(hoje), n);

  // id que não é de nenhum cartão do dono é ignorado: sem filtro fantasma.
  const cardId = p.cardId !== undefined && cards.some((c) => c.id === p.cardId) ? p.cardId : null;

  // O `DashReceivable` nasce em `montarEntradas` — a fronteira da 03-B proíbe montá-lo aqui.
  const { recs } = montarEntradas({
    recebiveis: receivables.map((r) => ({ ...r, statement: null, transaction: null })),
  });

  // `faturasPorMes` ignora fatura sem cartão; a contagem também, para as duas concordarem.
  const comCartao = p.statements.filter((s) => s.card_id);
  const doEscopo = cardId === null ? comCartao : comCartao.filter((s) => s.card_id === cardId);

  const valores = valoresPorMes(doEscopo, recs, meses, base);
  const porMes = meses.map((mes, i) => ({ mes, valores: valores[i] }));
  const totais = somar(valores);

  // Por cartão: o mesmo `faturasPorMes`, uma chamada por cartão, somado nos meses.
  const cardPorId = new Map<string, CartaoDaCentral>(cards.map((c) => [c.id, c]));
  const idsComFatura = [...new Set(doEscopo.map((s) => s.card_id as string))];
  const porCartao: RelatorioDeCartao["porCartao"] = [];
  for (const id of idsComFatura) {
    const soDele = doEscopo.filter((s) => s.card_id === id);
    const somado = somar(valoresPorMes(soDele, recs, meses, base));
    if (!somado) continue; // fatura fora do período
    // Fatura de um cartão que a leitura não trouxe: a dívida aparece mesmo assim, e Σ fecha.
    const card: CartaoDaCentral = cardPorId.get(id) ?? {
      id,
      nome: "Cartão sem nome",
      cor: "#9ca3af", // cinza neutro: o cartão não veio da leitura
      ativo: false,
      dia_fechamento: 1,
      dia_vencimento: 1,
    };
    porCartao.push({ card, valores: somado });
  }
  porCartao.sort(
    (a, b) =>
      Number(b.card.ativo) - Number(a.card.ativo) ||
      a.card.nome.localeCompare(b.card.nome, "pt-BR"),
  );

  return { base, n, meses, cardId, porMes, totais, porCartao };
}
