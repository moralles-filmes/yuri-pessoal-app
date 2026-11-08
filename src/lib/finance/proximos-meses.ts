/**
 * REDESIGN-05-C — Próximos meses da central de cartões (lógica PURA, testada em proximos-meses.test.ts).
 * Desenho: docs/superpowers/specs/2026-11-02-05c-proximos-meses-design.md (§5).
 *
 * Monta a grade MÊS × CARTÃO por COMPETÊNCIA (o mês em que a fatura fecha, o `month` de /faturas).
 * Cada célula tem UM estado:
 *  - `real`: existe fatura com essa competência (aberta/fechada/atrasada/paga/crédito/zero medido);
 *  - `prevista`: sem fatura real, cartão ativo e o ciclo ainda não fechou — SEM valor, nunca R$ 0,00;
 *  - `fechou-sem-lancamentos`: sem fatura real, cartão ativo e o ciclo já fechou (fato, não dúvida);
 *  - `nao-projeta`: sem fatura real e cartão desativado.
 *
 * NADA É REESCRITO: o estado vem de `statusEfetivo`, o ciclo de `montarFatura` (que clampa o dia de
 * fechamento em mês curto), o total do mês de `faturasPorMes` e a parte dos terceiros de
 * `parteDosTerceirosPorFatura`. `meu = total − terceiros`, em CENTAVOS inteiros. `hoje` é injetado;
 * sem `Date.now()`.
 *
 * Ausência não é zero: mês sem nenhuma fatura real tem total `null` (o zero de `faturasPorMes` para
 * mês vazio nunca sai daqui). Fatura real com total 0 é zero MEDIDO.
 */
import {
  type DashStatement,
  faturasPorMes,
  mesDe,
  parteDosTerceirosPorFatura,
  proximosMeses,
} from "@/lib/finance/dashboard";
import { montarFatura, statusEfetivo } from "@/lib/finance/invoice";
import { montarEntradas } from "@/lib/finance/pipeline";
import { reaisParaCentavos } from "@/lib/format";
import type { ReceivableWithPerson } from "@/types/database";
import type { CartaoDaCentral, EstadoDaLinha } from "@/lib/finance/central-cartoes";

/* ───────────────────────────── Tipos ───────────────────────────── */

export const HORIZONTES = [3, 6, 12] as const;
export type Horizonte = (typeof HORIZONTES)[number];

/** `?meses=`: só 3, 6 ou 12 (texto exato); qualquer outro valor vale 6. */
export function horizonteDeMeses(bruto: string | undefined): Horizonte {
  const achado = HORIZONTES.find((h) => String(h) === bruto);
  return achado ?? 6;
}

export type CelulaDoMes =
  | {
      tipo: "real";
      statementId: string;
      estado: EstadoDaLinha;
      /** total < 0 */
      credito: boolean;
      /** Instante cru (timestamptz); a tela o formata em Brasília. */
      pagoEm: string | null;
      tabela: "abertas" | "fechadas";
      aPagar: boolean;
      totalCent: number;
      meuCent: number;
      dataFechamento: string;
      dataVencimento: string;
      href: string;
    }
  | { tipo: "prevista"; dataFechamento: string; dataVencimento: string; href: string }
  | { tipo: "fechou-sem-lancamentos" }
  | { tipo: "nao-projeta" };

/** `null` = nenhuma fatura real no mês (a tela escreve "sem lançamentos conhecidos"). */
export type TotalDoMes = {
  totalCent: number;
  meuCent: number;
  qtdPagas: number;
  qtdPrevistas: number;
} | null;

export type ProximosMeses = {
  /** 'yyyy-MM', do mais antigo ao mais novo. */
  meses: string[];
  /** Ativos antes, depois por nome (pt-BR). */
  cartoes: CartaoDaCentral[];
  /** `[cardId][mes]` */
  celulas: Record<string, Record<string, CelulaDoMes>>;
  /** `[mes]` */
  totais: Record<string, TotalDoMes>;
  atrasadasAntes: { cardId: string; cardNome: string; competencia: string }[];
  /** Nenhum cartão na grade. */
  vazio: boolean;
};

/* ───────────────────────────── Montagem ───────────────────────────── */

const hrefDaFatura = (cardId: string, mes: string) => `/faturas?card=${cardId}&month=${mes}`;

export function montarProximosMeses(p: {
  hoje: string;
  n: Horizonte;
  cards: readonly CartaoDaCentral[];
  statements: readonly DashStatement[];
  receivables: readonly ReceivableWithPerson[];
}): ProximosMeses {
  const { hoje, n, cards, statements, receivables } = p;
  const meses = proximosMeses(mesDe(hoje), n);

  // `meu` sai da regra única da fatura (total − Σ terceiros). O `DashReceivable` nasce em
  // `montarEntradas` — a fronteira da 03-B proíbe montá-lo aqui.
  const { recs } = montarEntradas({
    recebiveis: receivables.map((r) => ({ ...r, statement: null, transaction: null })),
  });
  const terceirosPorFatura = parteDosTerceirosPorFatura(recs);

  // Uma fatura real por (cartão, competência) — a última da lista, como `montarVisaoGeral`.
  const realPorChave = new Map<string, DashStatement>();
  for (const s of statements) {
    if (s.card_id) realPorChave.set(`${s.card_id}|${mesDe(s.competencia)}`, s);
  }

  // Colunas: todo cartão ATIVO; desativado só com fatura real em algum mês do horizonte.
  const cartoes = cards
    .filter((c) => c.ativo || meses.some((m) => realPorChave.has(`${c.id}|${m}`)))
    .slice()
    .sort(
      (a, b) =>
        Number(b.ativo) - Number(a.ativo) ||
        a.nome.localeCompare(b.nome, "pt-BR") ||
        a.id.localeCompare(b.id),
    );

  const celulas: Record<string, Record<string, CelulaDoMes>> = {};
  const reaisDaGrade: (typeof statements)[number][] = [];
  for (const card of cartoes) {
    const linha: Record<string, CelulaDoMes> = {};
    for (const mes of meses) {
      const real = realPorChave.get(`${card.id}|${mes}`);
      if (real) {
        reaisDaGrade.push(real);
        const totalCent = reaisParaCentavos(real.total_atual ?? 0);
        const estado = statusEfetivo(real, hoje);
        linha[mes] = {
          tipo: "real",
          statementId: real.id,
          estado,
          credito: totalCent < 0,
          pagoEm: real.pago_em,
          tabela: hoje < real.data_fechamento ? "abertas" : "fechadas",
          aPagar: (estado === "fechada" || estado === "atrasada") && totalCent > 0,
          totalCent,
          meuCent: totalCent - (terceirosPorFatura.get(real.id) ?? 0),
          dataFechamento: real.data_fechamento,
          dataVencimento: real.data_vencimento,
          href: hrefDaFatura(card.id, mes),
        };
        continue;
      }
      if (!card.ativo) {
        linha[mes] = { tipo: "nao-projeta" };
        continue;
      }
      const [ano, mesNum] = mes.split("-").map(Number);
      // O ciclo cujo fechamento cai neste mês; `montarFatura` clampa o dia (fevereiro, 31).
      const ciclo = montarFatura(ano, mesNum - 1, card.dia_fechamento, card.dia_vencimento);
      linha[mes] =
        hoje < ciclo.dataFechamento
          ? {
              tipo: "prevista",
              dataFechamento: ciclo.dataFechamento,
              dataVencimento: ciclo.dataVencimento,
              href: hrefDaFatura(card.id, mes),
            }
          : { tipo: "fechou-sem-lancamentos" };
    }
    celulas[card.id] = linha;
  }

  // Total conhecido do mês: `faturasPorMes` sobre as reais da grade; mês sem real ⇒ null.
  const porMes = new Map(
    faturasPorMes({
      statements: reaisDaGrade,
      receivables: recs,
      meses,
      agrupar: "competencia",
    }).map((f) => [f.mes, f]),
  );
  const totais: Record<string, TotalDoMes> = {};
  for (const mes of meses) {
    const reais = reaisDaGrade.filter((s) => mesDe(s.competencia) === mes);
    if (reais.length === 0) {
      totais[mes] = null;
      continue;
    }
    const f = porMes.get(mes);
    totais[mes] = {
      totalCent: reaisParaCentavos(f?.total ?? 0),
      meuCent: reaisParaCentavos(f?.meu ?? 0),
      qtdPagas: reais.filter((s) => statusEfetivo(s, hoje) === "paga").length,
      qtdPrevistas: cartoes.filter((c) => celulas[c.id][mes].tipo === "prevista").length,
    };
  }

  // Atrasadas com total > 0 antes do primeiro mês do horizonte (de QUALQUER cartão).
  const nomes = new Map(cards.map((c) => [c.id, c.nome]));
  const atrasadasAntes = statements
    .filter(
      (s) =>
        s.card_id &&
        mesDe(s.competencia) < meses[0] &&
        statusEfetivo(s, hoje) === "atrasada" &&
        reaisParaCentavos(s.total_atual ?? 0) > 0,
    )
    .map((s) => ({
      cardId: s.card_id as string,
      cardNome: nomes.get(s.card_id as string) ?? "Cartão sem nome",
      competencia: mesDe(s.competencia),
    }))
    .sort(
      (a, b) =>
        a.competencia.localeCompare(b.competencia) ||
        a.cardNome.localeCompare(b.cardNome, "pt-BR") ||
        a.cardId.localeCompare(b.cardId),
    );

  return { meses, cartoes, celulas, totais, atrasadasAntes, vazio: cartoes.length === 0 };
}
