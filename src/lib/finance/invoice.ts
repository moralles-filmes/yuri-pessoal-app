/**
 * Coração da Fase 03 — regra de fatura do cartão de crédito.
 * Lógica PURA: sem UI, sem DB, sem Date.now() interno. A data da compra é sempre
 * injetada, então é 100% determinística e testável (ver invoice.test.ts).
 *
 * Dado `dataCompra + diaFechamento + diaVencimento`, decide em QUAL fatura a compra
 * entra (competência), quando essa fatura fecha e quando vence. Toda matemática é
 * feita só com a parte de DATA (meia-noite local), evitando que o timezone "vaze"
 * o dia de fechamento para o mês errado.
 */
import { addMonths, format, getDaysInMonth, parseISO } from "date-fns";
import type { StatementStatus } from "@/lib/finance/constants";

const ISO = "yyyy-MM-dd";

export interface FaturaAlvo {
  /** 'yyyy-MM-dd' — dia 1 do mês de referência (mês em que a fatura fecha). */
  competencia: string;
  /** 'yyyy-MM-dd' — data de fechamento (dia clampado ao último dia do mês). */
  dataFechamento: string;
  /** 'yyyy-MM-dd' — data de vencimento (sempre > dataFechamento). */
  dataVencimento: string;
}

/**
 * Constrói uma data local (meia-noite) com o `day` "clampado" ao último dia do mês.
 * `monthIndex` pode estourar (ex.: 12 → janeiro do ano seguinte) — `new Date` normaliza.
 * Evita datas inválidas como 31/02 (vira 28/02 ou 29/02 em ano bissexto).
 */
function dateAtClampedDay(year: number, monthIndex: number, day: number): Date {
  const base = new Date(year, monthIndex, 1);
  const days = getDaysInMonth(base);
  const clamped = Math.min(Math.max(1, day), days);
  return new Date(base.getFullYear(), base.getMonth(), clamped);
}

/**
 * Monta a fatura (competência/fechamento/vencimento) a partir do MÊS de fechamento já
 * decidido. Função pura, reutilizável: `resolverFatura` a usa após descobrir o mês de
 * fechamento de uma compra, e os parcelamentos (Fase 04) a usam deslocando o mês de
 * fechamento parcela a parcela — sem reimplementar a regra de vencimento.
 * @param fechamentoYear ano do fechamento.
 * @param fechamentoMonth mês do fechamento (0..11; pode estourar — `new Date` normaliza).
 */
export function montarFatura(
  fechamentoYear: number,
  fechamentoMonth: number,
  diaFechamento: number,
  diaVencimento: number,
): FaturaAlvo {
  // Normaliza o ano/mês (caso fechamentoMonth tenha estourado ao deslocar parcelas).
  const norm = new Date(fechamentoYear, fechamentoMonth, 1);
  const fy = norm.getFullYear();
  const fm = norm.getMonth();

  // Data de fechamento no mês de fechamento (clampada).
  const dataFechamento = dateAtClampedDay(fy, fm, diaFechamento);

  // Vencimento: se diaVencimento <= diaFechamento, vence no mês SEGUINTE ao fechamento
  // (vencimento sempre depois do fechamento). Senão, no mesmo mês.
  const mesesAteVencimento = diaVencimento <= diaFechamento ? 1 : 0;
  const mesVencimento = addMonths(new Date(fy, fm, 1), mesesAteVencimento);
  let dataVencimento = dateAtClampedDay(
    mesVencimento.getFullYear(),
    mesVencimento.getMonth(),
    diaVencimento,
  );

  // Guarda de borda: se o clamp colapsou vencimento <= fechamento (ex.: fechamento 30,
  // vencimento 31 em fevereiro — ambos caem em 28), empurra vencimento p/ o mês seguinte.
  if (dataVencimento.getTime() <= dataFechamento.getTime()) {
    const proximo = addMonths(new Date(fy, fm, 1), mesesAteVencimento + 1);
    dataVencimento = dateAtClampedDay(
      proximo.getFullYear(),
      proximo.getMonth(),
      diaVencimento,
    );
  }

  // Competência = dia 1 do mês de fechamento.
  const competencia = new Date(fy, fm, 1);

  return {
    competencia: format(competencia, ISO),
    dataFechamento: format(dataFechamento, ISO),
    dataVencimento: format(dataVencimento, ISO),
  };
}

/**
 * Resolve a fatura-alvo de uma compra no cartão.
 * @param dataCompra 'yyyy-MM-dd' ou Date.
 * @param diaFechamento dia de fechamento configurado no cartão (1..31).
 * @param diaVencimento dia de vencimento configurado no cartão (1..31).
 */
export function resolverFatura(
  dataCompra: string | Date,
  diaFechamento: number,
  diaVencimento: number,
): FaturaAlvo {
  const compra =
    typeof dataCompra === "string" ? parseISO(dataCompra) : dataCompra;
  const compraYear = compra.getFullYear();
  const compraMonth = compra.getMonth(); // 0..11
  const compraDay = compra.getDate();

  // (1) Fechamento clampado ao mês da compra (ex.: fechamento 31 em fev → 28/29).
  const fechamentoNoMesCompra = dateAtClampedDay(
    compraYear,
    compraMonth,
    diaFechamento,
  );
  const fechamentoDayClamped = fechamentoNoMesCompra.getDate();

  // (2) Ciclo: compra ATÉ o dia de fechamento (inclusive) → fecha no mês da compra;
  //     compra depois do fechamento → fecha no mês seguinte. addMonths cuida da virada de ano.
  const mesesAteFechamento = compraDay <= fechamentoDayClamped ? 0 : 1;
  const mesFechamento = addMonths(
    new Date(compraYear, compraMonth, 1),
    mesesAteFechamento,
  );

  // (3) Decidido o mês de fechamento, a montagem da fatura (fechamento/vencimento/
  //     competência, com as guardas de borda) é delegada a `montarFatura` — fonte única
  //     da regra, reaproveitada pelos parcelamentos.
  return montarFatura(
    mesFechamento.getFullYear(),
    mesFechamento.getMonth(),
    diaFechamento,
    diaVencimento,
  );
}

/**
 * Status efetivo da fatura, calculado na leitura (sem cron). Só `pago_em` é persistido;
 * aberta/fechada/atrasada derivam de `hoje` vs as datas. Convenção (fonte única):
 *  - pago_em definido            → 'paga' (vence as demais)
 *  - hoje >= data_vencimento     → 'atrasada'
 *  - hoje >= data_fechamento     → 'fechada'
 *  - caso contrário              → 'aberta'
 * Comparação lexicográfica de strings 'yyyy-MM-dd' (ISO) é segura.
 */
export function statusEfetivo(
  s: {
    data_fechamento: string;
    data_vencimento: string;
    pago_em: string | null;
  },
  hoje: string,
): StatementStatus {
  if (s.pago_em) return "paga";
  if (hoje >= s.data_vencimento) return "atrasada";
  if (hoje >= s.data_fechamento) return "fechada";
  return "aberta";
}
