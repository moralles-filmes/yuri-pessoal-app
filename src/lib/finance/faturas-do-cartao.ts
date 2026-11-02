/**
 * REDESIGN-05-B — faturas de UM cartão, organizadas por prioridade (lógica PURA, testada em
 * faturas-do-cartao.test.ts). Desenho: docs/superpowers/specs/2026-11-02-05b-faturas-e-pagamentos-design.md (§6).
 *
 * NADA É REESCRITO: o estado vem de `statusEfetivo`, o ciclo em aberto de `cicloEmAberto` (o mesmo
 * da Visão geral) e a parte de cada terceiro da regra única (`parteDoTerceiroCentavos` sobre
 * `resumirRecebivel`). `meu = total − terceiros`, em CENTAVOS inteiros. `hoje` é injetado.
 *
 * Fatura "prevista" é o ciclo que ainda não tem lançamento conhecido: tem data, nunca valor
 * (`valores: null` — ausência não é R$ 0,00). Fatura real com total 0 é zero MEDIDO.
 */
import { cicloEmAberto, type EstadoDaLinha } from "@/lib/finance/central-cartoes";
import { mesDe, nextDayISO } from "@/lib/finance/dashboard";
import { montarFatura, resolverFatura, statusEfetivo } from "@/lib/finance/invoice";
import { parteDoTerceiroCentavos, perdoadoCentavos, resumirRecebivel } from "@/lib/finance/recebimentos";
import { reaisParaCentavos } from "@/lib/format";
import type { ReceivableWithPerson } from "@/types/database";

/* ───────────────────────────── Tipos ───────────────────────────── */

export type FaturaDaTela = {
  /** `statementId`, ou `prevista|${competencia}` na linha prevista. */
  chave: string;
  /** `null` ⇔ prevista. */
  statementId: string | null;
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
  itens: number;
  /** `null` ⇔ prevista (sem lançamentos conhecidos). */
  valores: { totalCent: number; meuCent: number; terceirosCent: number; perdoadoCent: number } | null;
  marca: "atual" | "proxima" | null;
  /** O 2º argumento de `rotuloDoEstado`. */
  tabela: "fechadas" | "abertas";
  acao: "pagar" | "pagar-antes" | "desfazer" | null;
};

export type GruposDeFaturas = {
  pagar: FaturaDaTela[];
  emAberto: FaturaDaTela[];
  proximas: FaturaDaTela[];
  anteriores: FaturaDaTela[];
};

export type IndicadoresDeFaturas = {
  aPagar: { totalCent: number; meuCent: number; qtd: number; qtdAtrasadas: number };
  /** `null` só se o cartão não existe (nunca acontece com um cartão válido). */
  atual: FaturaDaTela | null;
  proximoVencimento: { data: string; fatura: FaturaDaTela } | null;
};

export type FaturaLida = {
  id: string;
  competencia: string;
  data_fechamento: string;
  data_vencimento: string;
  pago_em: string | null;
  total_atual: number | null;
  itens: number | null;
};

/* ───────────────────────────── Montagem ───────────────────────────── */

const porChave = (a: FaturaDaTela, b: FaturaDaTela) => a.chave.localeCompare(b.chave);

/** Teto de ciclos à frente do próximo para a prevista pedida por `month` (desenho §8.1). */
const MAX_CICLOS_A_FRENTE = 24;

/**
 * Ciclo (datas de `montarFatura`, que clampa o dia) do mês `month` ('yyyy-MM'), só se ele for
 * POSTERIOR à competência do próximo ciclo e dentro do teto; senão `null`. Competência = mês do
 * fechamento, então o mês pedido é o mês de fechamento.
 */
function previstaDoMesPedido(
  month: string | null,
  compSeguinte: string,
  card: { dia_fechamento: number; dia_vencimento: number },
): { competencia: string; dataFechamento: string; dataVencimento: string } | null {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month <= compSeguinte) return null;
  const [ano, mes] = month.split("-").map(Number);
  const [anoSeg, mesSeg] = compSeguinte.split("-").map(Number);
  if ((ano - anoSeg) * 12 + (mes - mesSeg) > MAX_CICLOS_A_FRENTE) return null;
  const f = montarFatura(ano, mes - 1, card.dia_fechamento, card.dia_vencimento);
  return { competencia: f.competencia, dataFechamento: f.dataFechamento, dataVencimento: f.dataVencimento };
}

export function organizarFaturasDoCartao(p: {
  hoje: string;
  /** `ativo` ausente = `true` (Visão geral e testes atuais não mudam). */
  card: { dia_fechamento: number; dia_vencimento: number; ativo?: boolean };
  statements: readonly FaturaLida[];
  receivables: readonly ReceivableWithPerson[];
  /** 'yyyy-MM' */
  month: string | null;
  status: string | null;
}): { grupos: GruposDeFaturas; indicadores: IndicadoresDeFaturas; vazio: boolean } {
  const { hoje, card, statements, receivables, month, status } = p;
  const ativo = card.ativo ?? true;

  /* Terceiros por fatura, em centavos, pela regra única */
  const terceiros = new Map<string, { parte: number; perdoado: number }>();
  for (const r of receivables) {
    if (!r.statement_id) continue;
    const resumido = resumirRecebivel(r);
    const acc = terceiros.get(r.statement_id) ?? { parte: 0, perdoado: 0 };
    acc.parte += parteDoTerceiroCentavos(resumido);
    acc.perdoado += perdoadoCentavos(resumido);
    terceiros.set(r.statement_id, acc);
  }

  const tabelaDe = (dataFechamento: string): FaturaDaTela["tabela"] =>
    hoje < dataFechamento ? "abertas" : "fechadas";

  const real = (s: FaturaLida, marca: FaturaDaTela["marca"]): FaturaDaTela => {
    const totalCent = reaisParaCentavos(s.total_atual ?? 0);
    const t = terceiros.get(s.id) ?? { parte: 0, perdoado: 0 };
    const estado = statusEfetivo(s, hoje);
    const acao: FaturaDaTela["acao"] =
      estado === "paga"
        ? "desfazer"
        : totalCent <= 0
          ? null
          : estado === "aberta"
            ? "pagar-antes"
            : "pagar";
    return {
      chave: s.id,
      statementId: s.id,
      competencia: mesDe(s.competencia),
      dataFechamento: s.data_fechamento,
      dataVencimento: s.data_vencimento,
      estado,
      credito: totalCent < 0,
      pagoEm: s.pago_em,
      itens: s.itens ?? 0,
      valores: { totalCent, meuCent: totalCent - t.parte, terceirosCent: t.parte, perdoadoCent: t.perdoado },
      marca,
      tabela: tabelaDe(s.data_fechamento),
      acao,
    };
  };

  const prevista = (
    ciclo: { competencia: string; dataFechamento: string; dataVencimento: string },
    marca: FaturaDaTela["marca"],
  ): FaturaDaTela => {
    const competencia = mesDe(ciclo.competencia);
    return {
      chave: `prevista|${competencia}`,
      statementId: null,
      competencia,
      dataFechamento: ciclo.dataFechamento,
      dataVencimento: ciclo.dataVencimento,
      estado: "prevista",
      credito: false,
      pagoEm: null,
      itens: 0,
      valores: null,
      marca,
      tabela: tabelaDe(ciclo.dataFechamento),
      acao: null,
    };
  };

  /* Ciclo atual e seguinte */
  const ciclo = cicloEmAberto(hoje, card);
  const compAtual = mesDe(ciclo.competencia);
  const seguinte = resolverFatura(nextDayISO(ciclo.dataFechamento), card.dia_fechamento, card.dia_vencimento);
  const compSeguinte = mesDe(seguinte.competencia);

  // Real do ciclo atual só vale como "atual" enquanto ainda acumula (hoje < fechamento): fechada
  // pelas próprias datas (cartão reconfigurado), ela segue o próprio estado e o ciclo vira prevista.
  const realAtual = statements.find((s) => mesDe(s.competencia) === compAtual && hoje < s.data_fechamento);
  const realSeguinte = statements.find((s) => mesDe(s.competencia) === compSeguinte);

  const linhas: FaturaDaTela[] = [];
  for (const s of statements) {
    const marca = s === realAtual ? "atual" : s === realSeguinte ? "proxima" : null;
    linhas.push(real(s, marca));
  }
  // Cartão desativado não acumula compras: nenhuma prevista (atual, próxima ou do mês pedido).
  // As faturas reais seguem todas — uma parcela pode ter criado qualquer uma delas.
  if (ativo) {
    if (!realAtual) linhas.push(prevista(ciclo, "atual"));
    if (!realSeguinte) linhas.push(prevista(seguinte, "proxima"));
    // Prevista de um mês futuro além do próximo ciclo, só quando o `month` da URL a pede
    // (destino das células previstas de "Próximos meses"). Sem `month`, nada muda.
    const extra = previstaDoMesPedido(month, compSeguinte, card);
    if (extra && !statements.some((s) => mesDe(s.competencia) === mesDe(extra.competencia))) {
      linhas.push(prevista(extra, null));
    }
  }

  /* Grupos (sobre a lista SEM filtro, para os indicadores) */
  const pagar = linhas
    .filter((f) => f.acao === "pagar")
    .sort(
      (a, b) =>
        Number(b.estado === "atrasada") - Number(a.estado === "atrasada") ||
        a.dataVencimento.localeCompare(b.dataVencimento) ||
        a.competencia.localeCompare(b.competencia) ||
        porChave(a, b),
    );
  const resto = linhas.filter((f) => f.acao !== "pagar");
  const emAberto = resto.filter((f) => f.marca === "atual").sort(porChave);
  const proximas = resto
    .filter((f) => f.marca !== "atual" && f.competencia > compAtual)
    .sort((a, b) => a.competencia.localeCompare(b.competencia) || porChave(a, b));
  const anteriores = resto
    .filter((f) => f.marca !== "atual" && f.competencia <= compAtual)
    .sort((a, b) => b.competencia.localeCompare(a.competencia) || porChave(a, b));

  /* Indicadores: sempre sobre todas as linhas do cartão */
  const atual = linhas.find((f) => f.marca === "atual") ?? null;
  const futuros = pagar.filter((f) => f.dataVencimento >= hoje);
  const proximoPagar = futuros.reduce<FaturaDaTela | null>(
    (menor, f) => (menor === null || f.dataVencimento < menor.dataVencimento ? f : menor),
    null,
  );
  // A atual já paga não vence nada: apontar para ela sugeriria uma dívida que não existe.
  const dono = proximoPagar ?? (atual && atual.estado !== "paga" ? atual : null);
  const indicadores: IndicadoresDeFaturas = {
    aPagar: {
      totalCent: pagar.reduce((s, f) => s + f.valores!.totalCent, 0),
      meuCent: pagar.reduce((s, f) => s + f.valores!.meuCent, 0),
      qtd: pagar.length,
      qtdAtrasadas: pagar.filter((f) => f.estado === "atrasada").length,
    },
    atual,
    proximoVencimento: dono ? { data: dono.dataVencimento, fatura: dono } : null,
  };

  /* Filtros: depois de incluir as previstas, antes de entregar */
  const passa = (f: FaturaDaTela) => {
    if (month && f.competencia !== month) return false;
    if (status) {
      if (f.estado === "prevista") return status === "aberta";
      return f.estado === status;
    }
    return true;
  };
  const grupos: GruposDeFaturas = {
    pagar: pagar.filter(passa),
    emAberto: emAberto.filter(passa),
    proximas: proximas.filter(passa),
    anteriores: anteriores.filter(passa),
  };
  const vazio =
    grupos.pagar.length + grupos.emAberto.length + grupos.proximas.length + grupos.anteriores.length === 0;

  return { grupos, indicadores, vazio };
}
