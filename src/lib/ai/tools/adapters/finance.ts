import "server-only";

/**
 * Fase 18-C — IA · As três ferramentas do Financeiro. CASCAS FINAS.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ NENHUM `.from()`, NENHUM `select()` E — O QUE MAIS IMPORTA AQUI — NENHUMA CONTA.       ║
 * ║                                                                                       ║
 * ║ Os agregados saem de `getFinanceCardData` e `getInvoicesCardData`, que são EXATAMENTE ║
 * ║ as leituras dos cards do dashboard. Elas, por sua vez, entram por `resumoMes` e        ║
 * ║ `proximas6Faturas` (`finance/dashboard.ts`) — os módulos puros e testados do domínio.  ║
 * ║                                                                                       ║
 * ║ Este é o módulo onde reimplementar a soma é mais tentador e mais caro. As regras que   ║
 * ║ um adapter ingênuo quebraria, todas com bug real no histórico do projeto:              ║
 * ║                                                                                       ║
 * ║  • LANÇAMENTO DE CARTÃO NÃO MOVE SALDO DE CONTA. Quem move é o pagamento da fatura.   ║
 * ║  • PARCELA LANÇADA NÃO ESTÁ EM `transactions`: ali mora só a compra-pai, com o TOTAL. ║
 * ║    Quem ocupa a fatura de cada mês é `transaction_installments`. Somar `transactions`  ║
 * ║    por competência contaria a compra inteira no mês da compra E as parcelas depois.    ║
 * ║  • ESTORNO DE CARTÃO NÃO É ENTRADA DE CAIXA: ele já reduz o total da fatura.           ║
 * ║  • "MEU" ≠ "TOTAL": gasto dividido com terceiro tem `valor_pessoal`.                   ║
 * ║                                                                                       ║
 * ║ Nada disso é reimplementado aqui — é justamente por isso que nada disso pode quebrar.  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ **Os valores saem na MESMA unidade em que a tela os formata** (`formatCurrency`), sem
 * nenhuma conversão nesta camada. Multiplicar ou dividir por 100 aqui faria a IA relatar um
 * número cem vezes maior ou menor que o da tela — e o adapter não tem informação nenhuma que
 * o dashboard já não tenha aplicado.
 *
 * `user_id` não aparece em lugar nenhum: as queries rodam sob RLS, com a sessão do usuário.
 */

import { z } from "zod";
import { getAccounts } from "@/lib/finance/queries";
import { ultimoDiaDoMes } from "@/lib/finance/pipeline";
import { saldoDasContas } from "@/lib/finance/saldo-das-contas";
import {
  getFinanceCardData,
  getInvoicesCardData,
} from "@/lib/dashboard/queries";
import { hojeISO } from "@/lib/format";
import { emptyToolOutput, type ToolOutput, type ToolRef } from "../contracts";

/** ⚠️ `.strict()` em todos: campo a mais é erro, e é por aqui que `user_id` seria barrado. */
export const getBalancesInput = z.object({}).strict();

export const getSpendingInput = z
  .object({
    mes: z
      .string()
      .regex(/^\d{4}-\d{2}$/, "Use o mês no formato AAAA-MM.")
      .optional(),
  })
  .strict();

export const getInvoiceInput = z.object({}).strict();

const REF_CONTAS: ToolRef = { tipo: "painel_de_contas", id: "contas", rota: "/financeiro" };
const REF_FATURAS: ToolRef = { tipo: "painel_de_faturas", id: "faturas", rota: "/faturas" };

/** O mês de uma data pura 'yyyy-MM-dd' — sem construir `Date`, que traria fuso à toa. */
const mesDe = (iso: string) => iso.slice(0, 7);

export async function getBalances(): Promise<ToolOutput> {
  const contas = await getAccounts();

  if (contas.length === 0) {
    return emptyToolOutput("Ainda não há conta cadastrada.");
  }

  // Decisão do dono na 03-B2, B3: esconder a conta não faz o dinheiro sumir.
  // A soma dos itens fecha com o total porque as contas omitidas têm saldo zero.
  const visiveis = contas.filter((c) => c.is_active || (c.current_balance ?? 0) !== 0);

  if (visiveis.length === 0) {
    return emptyToolOutput(
      `Não há conta ativa — as ${contas.length} existentes estão inativas.`,
    );
  }

  return {
    periodo: null,
    contagem: visiveis.length,
    completude: "exato",
    agregados: {
      contas_ativas: contas.filter((c) => c.is_active).length,
      contas_inativas_com_saldo: visiveis.filter((c) => !c.is_active).length,
      // A MESMA soma do card do dashboard: `saldoDasContas` sobre TODAS as contas,
      // com saldo da view `accounts_with_balance` (a fonte única do saldo).
      saldo_total: saldoDasContas(contas),
      moeda: "BRL",
      /**
       * ⚠️ Esta frase vai ao modelo de propósito. Sem ela, perguntado "quanto tenho?", ele
       * somaria o saldo das contas com a fatura em aberto — que são coisas diferentes e não
       * se somam: a fatura só vira saída de conta quando é paga.
       */
      observacao_do_saldo:
        "Este é o saldo das CONTAS. Lançamento de cartão de crédito não move saldo de conta — quem move é o pagamento da fatura. Para faturas, use a ferramenta de faturas.",
    },
    itens: visiveis.map((c) => ({
      conta: c.name,
      tipo: c.type,
      saldo: c.current_balance ?? 0,
      inativa: !c.is_active,
    })),
    refs: [REF_CONTAS],
  };
}

export async function getSpending(input: { mes?: string }): Promise<ToolOutput> {
  const hoje = hojeISO();
  const mes = input.mes ?? mesDe(hoje);

  // A MESMA leitura do card de Finanças do dashboard. Ela entra por `resumoMes`, que é o
  // agregador puro e testado do módulo — o `metrics.ts` do financeiro.
  const d = await getFinanceCardData(mes, hoje);

  return {
    periodo: { de: `${mes}-01`, ate: mes === mesDe(hoje) ? hoje : ultimoDiaDoMes(mes) },
    // Não é uma lista de transações: a ferramenta devolve o RESUMO do mês, e é isso que a
    // contagem representa. Uma lista de lançamentos é outra ferramenta, que não existe.
    contagem: 1,
    completude: d.completude.estado,
    ...(d.completude.estado === "parcial"
      ? { motivo_incompleto: d.completude.motivos.join(" ") }
      : {}),
    agregados: {
      mes,
      moeda: "BRL",
      entradas: d.entradas,
      /**
       * REDESIGN-03-C (A5) — ⚠️ `entradas_meu` e `entradas_terceiros` NÃO se somam a `entradas`:
       * eles a PARTICIONAM. `entradas` é o bruto que passou pelas contas; `entradas_meu` é a
       * renda do usuário; `entradas_terceiros` é dinheiro de outras pessoas que passou pela conta
       * dele — e NÃO é renda dele. Os dois já vêm somados pelo motor (invariante 15).
       */
      entradas_meu: d.entradasMeu,
      entradas_terceiros: d.entradasTerceiros,
      saidas: d.saidas,
      /**
       * ⚠️ `meu` e `terceiros` NÃO se somam a `saidas` — eles a PARTICIONAM. `saidas` é o
       * total movimentado; `meu` é a parte que de fato é do usuário. Um modelo que somasse os
       * três diria que o usuário gastou o dobro.
       */
      gasto_meu: d.meu,
      gasto_de_terceiros: d.terceiros,
      // As duas formas também particionam `saidas`: à vista + cartão = saídas.
      no_cartao: d.cartao,
      a_vista: d.aVista,
      a_receber_de_terceiros: d.aReceber,
      contas_a_pagar_total: d.contasTotal,
      contas_a_pagar_quantidade: d.contasCount,
      proxima_conta: d.proximaConta,
      composicao:
        "entradas e saídas são independentes; `entradas_meu` + `entradas_terceiros` = `entradas`; `gasto_meu` + `gasto_de_terceiros` = `saidas`; `no_cartao` + `a_vista` = `saidas`. Não some as partições entre si nem com o total.",
      base_de_calculo:
        "Gasto no cartão é o total das FATURAS do mês (base fatura); o restante é base competência. Parcela de compra parcelada entra pela fatura do mês dela, não pelo mês da compra.",
    },
    itens: [],
    refs: [REF_CONTAS],
  };
}

export async function getInvoice(): Promise<ToolOutput> {
  const hoje = hojeISO();
  const d = await getInvoicesCardData(hoje);
  const completude = {
    completude: d.completude.estado,
    ...(d.completude.estado === "parcial"
      ? { motivo_incompleto: d.completude.motivos.join(" ") }
      : {}),
  };

  if (!d.hasCards) {
    return {
      ...emptyToolOutput("Não há cartão de crédito cadastrado, então não há fatura."),
      ...completude,
    };
  }

  if (d.proximas.length === 0) {
    return {
      ...emptyToolOutput(
        "Há cartão cadastrado, mas nenhuma fatura para mostrar. Isso é ausência de fatura registrada, não uma fatura de valor zero.",
      ),
      ...completude,
    };
  }

  return {
    periodo: null,
    contagem: d.proximas.length,
    ...completude,
    agregados: {
      moeda: "BRL",
      faturas_abertas: d.abertas,
      faturas_fechadas: d.fechadas,
      faturas_pagas: d.pagas,
      total_das_nao_pagas: d.totalProximas,
      a_receber_de_terceiros: d.aReceber,
      /**
       * A fatura "virtual" é uma projeção do sistema para um mês que ainda não tem linha no
       * banco. Relatá-la como se fosse fatura fechada afirmaria um valor que ainda vai mudar.
       */
      observacao_virtual:
        "Uma fatura marcada como `projetada` ainda não existe no banco: é a estimativa do próximo ciclo e vai mudar até o fechamento. Diga isso ao citá-la.",
    },
    itens: d.proximas.map((f) => ({
      cartao: f.cardNome,
      competencia: f.competencia,
      vencimento: f.dataVencimento,
      // O status é DERIVADO na leitura (aberta / fechada / atrasada / paga), como toda
      // fatura neste projeto desde a Fase 03. Não é coluna.
      status: f.status,
      total: f.total,
      meu: f.meu,
      de_terceiros: f.terceiros,
      projetada: f.virtual,
    })),
    refs: [REF_FATURAS],
  };
}
