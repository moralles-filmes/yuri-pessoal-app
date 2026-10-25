import "server-only";
/**
 * REDESIGN-03-E · T4a — A LEITURA DA BASE CAIXA (§5.4 e §6.2 do desenho; P6, P10, P11).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ Uma consulta só alimenta o painel inteiro: do dia 1 do mês ANTERIOR ao último dia do  ║
 * ║ mês selecionado, para o comparativo "até o dia D" (K3) ter os dois lados.             ║
 * ║                                                                                      ║
 * ║ ⛔ A consulta pode trazer a MAIS; nunca decide sozinha. O `or` do PostgREST é só um   ║
 * ║    afunilamento — quem decide se um lançamento entra é `dataDeCaixa`, em memória      ║
 * ║    (P11). Por isso as linhas são REFILTRADAS aqui.                                    ║
 * ║ ⛔ Falha de leitura NUNCA vira zero: `{ ok: false }`, e a tela diz que não leu.       ║
 * ║ ⛔ Teto visível: `count` exato maior que o que chegou ⇒ `parcial: true` — o max_rows   ║
 * ║   do PostgREST corta antes do nosso `limit` (leituraComTeto, 03-B2).                  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `card_statements.pago_transacao_id` vem de TODAS as faturas, sem filtro de data (P10): o
 * pagamento de uma fatura antiga pode cair no período, e a fatura não carrega a data dele.
 * Os recebíveis são os de `/terceiros` (`lerRecebiveis`) — a mesma leitura, não uma segunda.
 * 03-G (RR-E-9, D-G10): erro nela também é `{ ok: false }` (antes virava "nenhum recebível"), e
 * recebíveis ou recebimentos saturados também são `parcial`.
 *
 * O client é o COM SESSÃO: a RLS escopa o dono, então nenhuma consulta leva `user_id`.
 */
import { SETTLED_STATUSES } from "@/lib/finance/constants";
import {
  comparativoAteODia,
  dataDeCaixa,
  entradasDoCaixa,
  filtroDaJanelaDeCaixa,
  mesAnteriorDe,
  numerosDoCaixa,
  periodoAteODia,
  type ComparativoAteODia,
  type NumerosDoCaixa,
  type Periodo,
  type TxDeCaixa,
} from "@/lib/finance/caixa";
import {
  variacaoPct,
  type CategoriaSlice,
  type EvolucaoPonto,
  type FormaSlice,
  type MesAMesDados,
} from "@/lib/finance/dashboard";
import {
  evolucaoDoCaixa,
  faturasSemTotalPorMes,
  gastosDeCaixa,
  mesAMesDoCaixa,
  minhaParteDoCaixa,
  type MinhaParteDoCaixa,
  type MotorDoCaixa,
} from "@/lib/finance/caixa-minha-parte";
import { leituraComTeto } from "@/lib/finance/leitura-com-teto";
import { montarEntradas, primeiro, type Embutido } from "@/lib/finance/pipeline";
import { lerRecebiveis, TX_SELECT } from "@/lib/finance/queries";
import { ehErroDeLeitura, registrarFalhaDeLeitura } from "@/lib/supabase/leitura";
import type { TransactionWithRelations } from "@/types/database";
import type { RecebivelComRecebimentos } from "@/lib/finance/recebimentos";
import { createClient } from "@/lib/supabase/server";

// `filtroDaJanelaDeCaixa` mora em `caixa.ts` (puro, com `dataDeCaixa`); continua exportado por
// aqui para quem já importava deste módulo (caixa-leitura.test.ts).
export { filtroDaJanelaDeCaixa } from "@/lib/finance/caixa";

/** Linhas lidas por consulta. Saturou ⇒ `parcial`. */
export const TETO_DO_CAIXA = 5000;

const COLUNAS =
  "id,type,status,amount,valor_pessoal,competence_date,liquidado_em,account_id,transfer_account_id,card_id," +
  "payment_method,category:categories(id,name,color)";

export type LeituraDoCaixa =
  | {
      ok: true;
      transactions: TxDeCaixa[];
      pagamentosDeFatura: Set<string>;
      /** Id do lançamento que pagou → id da fatura (desenho 2026-10-18: abrir a fatura paga). */
      pagamentos: Map<string, string>;
      /**
       * As compras (e estornos) das faturas pagas DENTRO da janela, lidas por `statement_id` — sem
       * filtro de competência (§4.3): a fatura paga em outubro pode ter compra de abril, que a
       * janela do motor não alcança. Sem elas, a fatura se abriria pela metade.
       */
      comprasDasFaturasPagas: TransactionWithRelations[];
      recebiveis: RecebivelComRecebimentos[];
      /** O teto cortou: há lançamentos na janela que não vieram. */
      parcial: boolean;
      periodoLido: Periodo;
    }
  | { ok: false };

/**
 * O resultado da base caixa para a tela (§5.4): números do mês selecionado, do mês anterior
 * (P6: caixa × caixa, mês cheio) e as variações percentuais para os cards do topo.
 * `{ estado: 'erro' }` nunca vira zero — a tela declara que não leu.
 */
export type EstadoDoCaixa =
  | {
      estado: "ok";
      atual: NumerosDoCaixa;
      anterior: NumerosDoCaixa;
      parcial: boolean;
      /** `entradasDoCaixa(atual)` — pronto do servidor, para a tela não refazer a soma. */
      entradasDeCaixa: number;
      /** Variação % das entradas vs. o mês anterior (null quando o anterior é 0 — `variacaoPct`). */
      entradasPct: number | null;
      /** Variação % das saídas vs. o mês anterior. */
      saidasPct: number | null;
      /** K3b: o corte "até o dia D" do mês em andamento (`ateODia` null com o mês fechado). */
      corte: ComparativoAteODia;
      /** Desenho 2026-10-18: os gráficos da base caixa, só com a parte do dono. */
      graficos: GraficosDoCaixa;
    }
  | { estado: "erro" };

/** Os gráficos da base caixa, prontos do servidor (mesmas formas dos de competência). */
export type GraficosDoCaixa = {
  /** O mês selecionado: card "Minhas saídas" e o rodapé das faturas sem total. */
  minha: MinhaParteDoCaixa;
  evolucao: EvolucaoPonto[];
  mesAMes: { ateODia: number | null; dados: MesAMesDados };
  categorias: CategoriaSlice[];
  formas: FormaSlice[];
  /** Meses com pagamento de fatura contado cheio (sem total), por gráfico — o rodapé declara. */
  semTotal: { evolucao: MesComSemTotal[]; mesAMes: MesComSemTotal[] };
};

type MesComSemTotal = { mes: string; quantidade: number };

type LinhaBruta = Omit<TxDeCaixa, "amount" | "valor_pessoal" | "category"> & {
  // O PostgREST pode devolver `numeric` como texto.
  amount: number | string;
  valor_pessoal: number | string | null;
  // A relação embutida pode vir como objeto OU array: normalizada por `primeiro`, como no motor.
  category?: Embutido<{ id: string; name: string; color: string | null }>;
};

/**
 * Lê os lançamentos liquidados da janela, os pagamentos de fatura e os recebíveis. A janela vai
 * do dia 1 de `desdeMes` (padrão: o mês anterior, o mínimo do comparativo K3) ao fim de `mesSel`;
 * a evolução de 6 meses (desenho 2026-10-18) pede `desdeMes` = o primeiro mês dela.
 */
export async function lerCaixaDoMes(
  mesSel: string,
  desdeMes: string = mesAnteriorDe(mesSel),
): Promise<LeituraDoCaixa> {
  const periodoLido: Periodo = {
    de: `${desdeMes < mesSel ? desdeMes : mesAnteriorDe(mesSel)}-01`,
    ate: periodoAteODia(mesSel, 31).ate,
  };

  const supabase = await createClient();
  const [lancamentos, faturas, recebiveis] = await Promise.all([
    supabase
      .from("transactions")
      .select(COLUNAS, { count: "exact" })
      .in("status", [...SETTLED_STATUSES])
      .or(filtroDaJanelaDeCaixa(periodoLido))
      .limit(TETO_DO_CAIXA),
    supabase
      .from("card_statements")
      .select("id,pago_transacao_id", { count: "exact" })
      .not("pago_transacao_id", "is", null),
    // A terceira leitura LANÇA (03-G); o caixa já sabe dizer erro, então ela passa a ser
    // conferida como as outras duas — `null` aqui é "não li", nunca "nenhum recebível".
    lerRecebiveis().catch((e: unknown) => {
      if (!ehErroDeLeitura(e)) throw e;
      registrarFalhaDeLeitura(e);
      return null;
    }),
  ]);

  if (lancamentos.error || faturas.error || recebiveis === null) return { ok: false };

  const leituraTx = leituraComTeto((lancamentos.data ?? []) as unknown as LinhaBruta[], lancamentos.count);
  const leituraFaturas = leituraComTeto(
    (faturas.data ?? []) as { id: string; pago_transacao_id: string | null }[],
    faturas.count,
  );
  // Sem contagem também é parcial: errar para "pode faltar coisa" é o único erro aceitável.
  const parcial =
    leituraTx.situacao !== "completa" ||
    leituraFaturas.situacao !== "completa" ||
    recebiveis.situacao !== "completa" ||
    recebiveis.situacaoDosRecebimentos !== "completa";

  const transactions: TxDeCaixa[] = leituraTx.linhas
    .map((l) => {
      const categoria = primeiro(l.category ?? null);
      return {
        ...l,
        amount: Number(l.amount),
        valor_pessoal: l.valor_pessoal === null ? null : Number(l.valor_pessoal),
        category: categoria ? { id: categoria.id, name: categoria.name, color: categoria.color } : null,
      };
    })
    .filter((t) => {
      const { data } = dataDeCaixa(t);
      return data >= periodoLido.de && data <= periodoLido.ate;
    });

  const pagamentosDeFatura = new Set<string>();
  const pagamentos = new Map<string, string>();
  for (const f of leituraFaturas.linhas) {
    if (!f.pago_transacao_id) continue;
    pagamentosDeFatura.add(f.pago_transacao_id);
    pagamentos.set(f.pago_transacao_id, f.id);
  }

  // As compras das faturas pagas na janela, por `statement_id` (sem filtro de competência).
  const idsNaJanela = new Set(transactions.map((t) => t.id));
  const faturasPagas = [...new Set([...pagamentos].filter(([tx]) => idsNaJanela.has(tx)).map(([, f]) => f))];
  let comprasDasFaturasPagas: TransactionWithRelations[] = [];
  let comprasParcial = false;
  if (faturasPagas.length > 0) {
    const compras = await supabase
      .from("transactions")
      .select(TX_SELECT, { count: "exact" })
      .in("statement_id", faturasPagas)
      .limit(TETO_DO_CAIXA);
    if (compras.error) return { ok: false };
    const leituraCompras = leituraComTeto((compras.data ?? []) as unknown as TransactionWithRelations[], compras.count);
    comprasDasFaturasPagas = leituraCompras.linhas;
    comprasParcial = leituraCompras.situacao !== "completa";
  }

  return {
    ok: true,
    transactions,
    pagamentosDeFatura,
    pagamentos,
    comprasDasFaturasPagas,
    recebiveis: recebiveis.linhas,
    parcial: parcial || comprasParcial,
    periodoLido,
  };
}

/**
 * Os números da base caixa prontos para a tela: mês selecionado, mês anterior (P6) e as
 * variações percentuais dos cards do topo. A leitura é a MESMA (`lerCaixaDoMes`); o recorte de
 * cada mês é `numerosDoCaixa` com o período até o dia 31 (mês cheio). O `corte` é o "até o dia D"
 * do mês em andamento (K3b), sobre os dados já lidos — a janela cobre o mês anterior inteiro.
 */
export async function estadoDoCaixa(
  mesSel: string,
  hoje: string,
  /** As entradas do motor (`lerFinanceiro`): faturas, recebíveis e itens — para abrir a fatura paga. */
  motor: MotorDoCaixa,
  /** Os meses da evolução (o primeiro decide o começo da janela lida). */
  evoMeses: string[],
): Promise<EstadoDoCaixa> {
  const leitura = await lerCaixaDoMes(mesSel, evoMeses[0]);
  if (!leitura.ok) return { estado: "erro" };

  const { transactions, pagamentosDeFatura, pagamentos, recebiveis, parcial } = leitura;
  // O motor só tem os lançamentos da janela evo..proj; as compras das faturas pagas entram pelo
  // MESMO pipeline (`montarEntradas`), sem duplicar o que o motor já tinha.
  const doMotor = new Set(motor.transactions.map((t) => t.id).filter(Boolean));
  const extras = montarEntradas({ transacoes: leitura.comprasDasFaturasPagas }).txs.filter(
    (t) => !t.id || !doMotor.has(t.id),
  );
  const doMes = {
    transactions,
    pagamentos,
    motor: { ...motor, transactions: [...motor.transactions, ...extras] },
  };

  const atual = numerosDoCaixa({
    periodo: periodoAteODia(mesSel, 31),
    transactions,
    pagamentosDeFatura,
    recebiveis,
  });
  const anterior = numerosDoCaixa({
    periodo: periodoAteODia(mesAnteriorDe(mesSel), 31),
    transactions,
    pagamentosDeFatura,
    recebiveis,
  });

  const entradasDeCaixa = entradasDoCaixa(atual);
  return {
    estado: "ok",
    atual,
    anterior,
    parcial,
    entradasDeCaixa,
    entradasPct: variacaoPct(entradasDeCaixa, entradasDoCaixa(anterior)),
    saidasPct: variacaoPct(atual.saidasDeCaixa, anterior.saidasDeCaixa),
    corte: comparativoAteODia({
      base: "caixa",
      mes: mesSel,
      hoje,
      caixa: { transactions, pagamentosDeFatura, recebiveis },
    }),
    graficos: {
      minha: minhaParteDoCaixa({ ...doMes, periodo: periodoAteODia(mesSel, 31) }),
      evolucao: evolucaoDoCaixa({ ...doMes, meses: evoMeses }),
      mesAMes: mesAMesDoCaixa({ ...doMes, mes: mesSel, hoje }),
      ...gastosDeCaixa({ ...doMes, periodo: periodoAteODia(mesSel, 31) }),
      semTotal: {
        evolucao: faturasSemTotalPorMes({ ...doMes, meses: evoMeses }),
        mesAMes: faturasSemTotalPorMes({ ...doMes, meses: [mesAnteriorDe(mesSel), mesSel] }),
      },
    },
  };
}
