/**
 * REDESIGN-05-A — Visão geral da central de cartões (lógica PURA, testada em central-cartoes.test.ts).
 * Desenho: docs/superpowers/specs/2026-11-02-05a-central-de-cartoes-design.md (§6 e §7).
 *
 * Monta, a partir de leituras que JÁ existem (cartões, faturas, recebíveis), duas tabelas:
 *  - FECHADAS — a pagar: faturas reais já fechadas (`atrasada`/`fechada`) de QUALQUER cartão
 *    (desativar não quita a dívida), mais a `paga` de cartão ativo até o vencimento (visível,
 *    fora da soma);
 *  - EM ABERTO — acumulando compras: o ciclo corrente de cada cartão ATIVO, com fatura real ou
 *    "prevista" (sem lançamentos conhecidos — sem valor, nunca R$ 0,00).
 *
 * NADA É REESCRITO: o estado vem de `statusEfetivo`, o ciclo de `resolverFatura` (o mesmo passo de
 * `proximas6Faturas`) e a parte de cada terceiro de `parteDoTerceiroCentavos` — a mesma de
 * `parteDosTerceirosPorFatura`. `meu = total − parte dos terceiros`, em CENTAVOS inteiros, e só
 * é calculado assim (nunca a partir das pessoas). `hoje` é injetado; sem `Date.now()`.
 *
 * Ausência não é zero: linha prevista tem `valores: null`; sem nenhuma linha somável o total é
 * `null`. Fatura real com total 0 é zero MEDIDO e entra na soma.
 */
import {
  type DashStatement,
  mesDe,
  nextDayISO,
  parteDosTerceirosPorFatura,
} from "@/lib/finance/dashboard";
import { type FaturaAlvo, resolverFatura, statusEfetivo } from "@/lib/finance/invoice";
import { montarEntradas } from "@/lib/finance/pipeline";
import { parteDoTerceiroCentavos, resumirRecebivel } from "@/lib/finance/recebimentos";
import { reaisParaCentavos } from "@/lib/format";
import type { CreditCardRow, ReceivableWithPerson } from "@/types/database";

/* ───────────────────────────── Tipos ───────────────────────────── */

export type CartaoDaCentral = Pick<
  CreditCardRow,
  "id" | "nome" | "cor" | "ativo" | "dia_fechamento" | "dia_vencimento"
>;
export type PessoaDaCentral = { id: string; nome: string };
export type EstadoDaLinha = "aberta" | "fechada" | "atrasada" | "paga" | "prevista";

export type LinhaDaCentral = {
  /** `statementId`, ou `${cardId}|${competencia}` na linha prevista. */
  chave: string;
  statementId: string | null;
  card: { id: string; nome: string; cor: string | null; ativo: boolean };
  /** 'yyyy-MM' */
  competencia: string;
  /** 'yyyy-MM-dd' */
  dataFechamento: string;
  dataVencimento: string;
  estado: EstadoDaLinha;
  /** total < 0 */
  credito: boolean;
  /** Instante cru (timestamptz); a tela o formata em Brasília. */
  pagoEm: string | null;
  /** `null` ⇔ prevista. `porPessoaCent` tem uma chave por coluna de pessoa da tabela da linha. */
  valores: { totalCent: number; meuCent: number; porPessoaCent: Record<string, number> } | null;
  entraNaSoma: boolean;
};

/** `null` = nenhuma linha somável (a tela escreve "sem lançamentos conhecidos"). */
export type TotalDaCentral = { totalCent: number; meuCent: number } | null;

export type VisaoGeralDosCartoes = {
  /** Por `dataVencimento` ascendente. */
  fechadas: LinhaDaCentral[];
  /** Por `dataFechamento` ascendente. */
  abertas: LinhaDaCentral[];
  /** Por nome (pt-BR). Só quem tem parte ≠ 0 em alguma linha da tabela. */
  pessoasFechadas: PessoaDaCentral[];
  pessoasAbertas: PessoaDaCentral[];
  aPagar: TotalDaCentral;
  emAberto: TotalDaCentral;
  qtdAPagar: number;
  qtdAtrasadas: number;
  /** Menor `dataVencimento >= hoje` entre as linhas somáveis de "fechadas". */
  proximoVencimento: string | null;
  temCartaoAtivo: boolean;
};

const PESSOA_SEM_NOME = "Pessoa sem nome";

/* ───────────────────────────── Partes dos terceiros ───────────────────────────── */

/**
 * A parte de cada terceiro em cada fatura, em CENTAVOS: `statement_id → person_id → centavos`.
 * Mesma regra de `parteDosTerceirosPorFatura` (D3: o valor; `ignorado` → o que ele pagou), então
 * Σ por pessoa de uma fatura é igual ao valor que aquela função devolve para ela.
 */
export function parteDosTerceirosPorPessoa(
  receivables: readonly ReceivableWithPerson[],
): Map<string, Map<string, number>> {
  const mapa = new Map<string, Map<string, number>>();
  for (const r of receivables) {
    if (!r.statement_id) continue;
    const porPessoa = mapa.get(r.statement_id) ?? new Map<string, number>();
    porPessoa.set(
      r.person_id,
      (porPessoa.get(r.person_id) ?? 0) + parteDoTerceiroCentavos(resumirRecebivel(r)),
    );
    mapa.set(r.statement_id, porPessoa);
  }
  return mapa;
}

/* ───────────────────────────── Ciclo em aberto ───────────────────────────── */

/**
 * O ciclo que ACUMULA compras em `hoje` para um cartão: o da compra de hoje, avançado enquanto
 * `hoje` já alcançou o fechamento. No dia do fechamento a fatura de hoje já é "fechada", então o
 * aberto é o ciclo seguinte.
 */
export function cicloEmAberto(
  hoje: string,
  card: { dia_fechamento: number; dia_vencimento: number },
): FaturaAlvo {
  let ciclo = resolverFatura(hoje, card.dia_fechamento, card.dia_vencimento);
  while (hoje >= ciclo.dataFechamento) {
    ciclo = resolverFatura(nextDayISO(ciclo.dataFechamento), card.dia_fechamento, card.dia_vencimento);
  }
  return ciclo;
}

/* ───────────────────────────── Montagem ───────────────────────────── */

/** Linha ainda sem as colunas de pessoa (preenchidas depois, por tabela). */
type LinhaBruta = Omit<LinhaDaCentral, "valores"> & {
  valores: { totalCent: number; meuCent: number } | null;
};

function somar(linhas: readonly LinhaDaCentral[]): TotalDaCentral {
  const somaveis = linhas.filter((l) => l.entraNaSoma && l.valores);
  if (somaveis.length === 0) return null;
  return {
    totalCent: somaveis.reduce((s, l) => s + l.valores!.totalCent, 0),
    meuCent: somaveis.reduce((s, l) => s + l.valores!.meuCent, 0),
  };
}

export function montarVisaoGeral(p: {
  hoje: string;
  cards: readonly CartaoDaCentral[];
  statements: readonly DashStatement[];
  receivables: readonly ReceivableWithPerson[];
}): VisaoGeralDosCartoes {
  const { hoje, cards, statements, receivables } = p;

  const porPessoa = parteDosTerceirosPorPessoa(receivables);
  // `meu` sai da regra única da fatura (total − Σ terceiros), nunca somando as pessoas. O
  // `DashReceivable` nasce em `montarEntradas` — a fronteira da 03-B proíbe montá-lo aqui.
  const { recs } = montarEntradas({
    recebiveis: receivables.map((r) => ({ ...r, statement: null, transaction: null })),
  });
  const terceirosPorFatura = parteDosTerceirosPorFatura(recs);

  const nomes = new Map<string, string>();
  for (const r of receivables) {
    if (r.person?.nome && !nomes.has(r.person_id)) nomes.set(r.person_id, r.person.nome);
  }

  const cardPorId = new Map(cards.map((c) => [c.id, c]));
  const cardDaLinha = (cardId: string): LinhaDaCentral["card"] => {
    const c = cardPorId.get(cardId);
    return c
      ? { id: c.id, nome: c.nome, cor: c.cor ?? null, ativo: c.ativo }
      : // Fatura de um cartão que a leitura não trouxe: a dívida aparece mesmo assim.
        { id: cardId, nome: "Cartão sem nome", cor: null, ativo: false };
  };

  const linhaReal = (s: DashStatement, estado: EstadoDaLinha): LinhaBruta => {
    const totalCent = reaisParaCentavos(s.total_atual ?? 0);
    const meuCent = totalCent - (terceirosPorFatura.get(s.id) ?? 0);
    return {
      chave: s.id,
      statementId: s.id,
      card: cardDaLinha(s.card_id as string),
      competencia: mesDe(s.competencia),
      dataFechamento: s.data_fechamento,
      dataVencimento: s.data_vencimento,
      estado,
      credito: totalCent < 0,
      pagoEm: s.pago_em,
      valores: { totalCent, meuCent },
      entraNaSoma: false,
    };
  };

  /* Fechadas */
  const fechadasBrutas: LinhaBruta[] = [];
  for (const s of statements) {
    if (!s.card_id || hoje < s.data_fechamento) continue;
    const estado = statusEfetivo(s, hoje);
    const linha = linhaReal(s, estado);
    if (estado === "atrasada" || estado === "fechada") {
      linha.entraNaSoma = !linha.credito;
      fechadasBrutas.push(linha);
    } else if (estado === "paga" && linha.card.ativo && s.data_vencimento >= hoje) {
      fechadasBrutas.push(linha);
    }
  }

  /* Em aberto: o ciclo corrente de cada cartão ATIVO */
  const realPorChave = new Map<string, DashStatement>();
  for (const s of statements) {
    if (s.card_id) realPorChave.set(`${s.card_id}|${mesDe(s.competencia)}`, s);
  }
  const abertasBrutas: LinhaBruta[] = [];
  for (const card of cards) {
    if (!card.ativo) continue;
    const ciclo = cicloEmAberto(hoje, card);
    const competencia = mesDe(ciclo.competencia);
    const real = realPorChave.get(`${card.id}|${competencia}`);
    // Fatura real já fechada pelas próprias datas (cartão reconfigurado) está em "fechadas":
    // não entra duas vezes, e o ciclo aqui segue sem lançamentos conhecidos.
    if (real && hoje < real.data_fechamento) {
      const estado = statusEfetivo(real, hoje);
      const linha = linhaReal(real, estado);
      linha.entraNaSoma = estado === "aberta" && !linha.credito;
      abertasBrutas.push(linha);
    } else {
      abertasBrutas.push({
        chave: `${card.id}|${competencia}`,
        statementId: null,
        card: cardDaLinha(card.id),
        competencia,
        dataFechamento: ciclo.dataFechamento,
        dataVencimento: ciclo.dataVencimento,
        estado: "prevista",
        credito: false,
        pagoEm: null,
        valores: null,
        entraNaSoma: false,
      });
    }
  }

  /* Colunas de pessoa: só quem tem parte ≠ 0 em alguma linha da tabela */
  const completar = (brutas: LinhaBruta[]) => {
    const ids = new Set<string>();
    for (const l of brutas) {
      if (!l.statementId) continue;
      for (const [pessoaId, cent] of porPessoa.get(l.statementId) ?? []) {
        if (cent !== 0) ids.add(pessoaId);
      }
    }
    const pessoas: PessoaDaCentral[] = [...ids]
      .map((id) => ({ id, nome: nomes.get(id) ?? PESSOA_SEM_NOME }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id));
    const linhas: LinhaDaCentral[] = brutas.map((l) => {
      if (!l.valores) return { ...l, valores: null };
      const doStatement = l.statementId ? porPessoa.get(l.statementId) : undefined;
      const porPessoaCent: Record<string, number> = {};
      for (const pessoa of pessoas) porPessoaCent[pessoa.id] = doStatement?.get(pessoa.id) ?? 0;
      return { ...l, valores: { ...l.valores, porPessoaCent } };
    });
    return { pessoas, linhas };
  };

  const fechadasCompletas = completar(fechadasBrutas);
  const abertasCompletas = completar(abertasBrutas);

  const fechadas = fechadasCompletas.linhas.sort(
    (a, b) =>
      a.dataVencimento.localeCompare(b.dataVencimento) ||
      a.card.nome.localeCompare(b.card.nome, "pt-BR") ||
      a.chave.localeCompare(b.chave),
  );
  const abertas = abertasCompletas.linhas.sort(
    (a, b) =>
      a.dataFechamento.localeCompare(b.dataFechamento) ||
      a.card.nome.localeCompare(b.card.nome, "pt-BR") ||
      a.chave.localeCompare(b.chave),
  );

  const somaveisFechadas = fechadas.filter((l) => l.entraNaSoma);
  const vencimentosFuturos = somaveisFechadas
    .map((l) => l.dataVencimento)
    .filter((d) => d >= hoje)
    .sort();

  return {
    fechadas,
    abertas,
    pessoasFechadas: fechadasCompletas.pessoas,
    pessoasAbertas: abertasCompletas.pessoas,
    aPagar: somar(fechadas),
    emAberto: somar(abertas),
    qtdAPagar: somaveisFechadas.length,
    qtdAtrasadas: somaveisFechadas.filter((l) => l.estado === "atrasada").length,
    proximoVencimento: vencimentosFuturos[0] ?? null,
    temCartaoAtivo: cards.some((c) => c.ativo),
  };
}
