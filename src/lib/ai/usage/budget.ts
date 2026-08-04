/**
 * Fase 18-A — IA · Orçamento.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O INVARIANTE, ESCRITO DE FORMA VERIFICÁVEL                                            ║
 * ║                                                                                       ║
 * ║   TERMINAIS     = {completed, cancelled, failed}                                      ║
 * ║   NÃO-TERMINAIS = {reserved, streaming}                                               ║
 * ║                                                                                       ║
 * ║   consumo = Σ custo real das tentativas de runs TERMINAIS                             ║
 * ║           + Σ reserva dos runs NÃO-TERMINAIS com reserva não expirada                 ║
 * ║                                                                                       ║
 * ║   Todo run pertence a EXATAMENTE UM dos dois somatórios. Nunca aos dois.              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Enquanto o run é não-terminal, SÓ a reserva conta — mesmo que a tentativa 1 já tenha custo
 * gravado. Isso é seguro porque a reserva cobre o pior caso permitido. Ao virar terminal, a
 * reserva sai de cena e valem os custos reais.
 *
 * ⚠️ Este arquivo é a parte pura (decisão e explicação). O BLOQUEIO de verdade acontece
 * dentro de `ai_begin_chat_run`, na mesma transação que cria a reserva — senão duas
 * requisições concorrentes leriam o mesmo consumo e as duas passariam.
 *
 * Puro. Nenhum I/O, `agora` injetado.
 */

import { round6 } from "./meter";

export const TERMINAIS = ["completed", "cancelled", "failed"] as const;
export const NAO_TERMINAIS = ["reserved", "streaming"] as const;

export type RunStatus = (typeof TERMINAIS)[number] | (typeof NAO_TERMINAIS)[number];

export function isTerminal(status: RunStatus): boolean {
  return (TERMINAIS as readonly string[]).includes(status);
}

/** O recorte de um run que o cálculo de orçamento precisa. */
export type RunForBudget = {
  readonly id: string;
  readonly status: RunStatus;
  readonly reservedCost: number;
  /** Instante ISO. Reserva vencida deixa de contar. */
  readonly reservationExpiresAt: string;
  /** Custos das tentativas. `null` = o provedor não informou. */
  readonly attemptCosts: readonly (number | null)[];
};

export type BudgetUsage = {
  readonly confirmadoUsd: number;
  readonly reservadoUsd: number;
  readonly totalUsd: number;
  /** Execuções terminais que ficaram sem custo informado. A tela DIZ isso. */
  readonly execucoesSemCusto: number;
  /** Runs que contribuíram por reserva. */
  readonly runsComReservaAtiva: number;
};

/**
 * O somatório do período. `agoraMs` injetado.
 *
 * A regra do XOR está aqui, numa linha só: `isTerminal` decide de qual lado o run entra, e
 * não existe caminho em que ele entre nos dois. O teste do módulo prova isso somando o
 * orçamento por duas vias independentes e exigindo igualdade.
 */
export function computeBudgetUsage(
  runs: readonly RunForBudget[],
  agoraMs: number,
): BudgetUsage {
  let confirmado = 0;
  let reservado = 0;
  let semCusto = 0;
  let comReserva = 0;

  for (const run of runs) {
    if (isTerminal(run.status)) {
      for (const c of run.attemptCosts) {
        if (c === null) semCusto += 1;
        else confirmado += c;
      }
      continue;
    }

    // Não-terminal: só a reserva conta, e só enquanto não expirou. Reserva vencida não
    // bloqueia chamada futura — ela é reconciliada, não perpetuada.
    const expiraEm = Date.parse(run.reservationExpiresAt);
    if (Number.isFinite(expiraEm) && expiraEm > agoraMs) {
      reservado += run.reservedCost;
      comReserva += 1;
    }
  }

  return {
    confirmadoUsd: round6(confirmado),
    reservadoUsd: round6(reservado),
    totalUsd: round6(confirmado + reservado),
    execucoesSemCusto: semCusto,
    runsComReservaAtiva: comReserva,
  };
}

export type BudgetDecision =
  | { readonly permitido: true; readonly restanteUsd: number | null }
  | { readonly permitido: false; readonly motivo: string; readonly restanteUsd: number };

/**
 * Cabe mais uma reserva? Limite `null` = sem limite definido — o que NÃO é o mesmo que
 * limite zero. Um `?? 0` aqui bloquearia o módulo inteiro para quem nunca configurou nada.
 */
export function canAdmit(
  usoAtual: BudgetUsage,
  novaReservaUsd: number,
  limiteUsd: number | null,
  bloquearNoLimite: boolean,
): BudgetDecision {
  if (limiteUsd === null || !bloquearNoLimite) {
    return { permitido: true, restanteUsd: null };
  }

  const restante = round6(limiteUsd - usoAtual.totalUsd);
  if (usoAtual.totalUsd + novaReservaUsd > limiteUsd) {
    return {
      permitido: false,
      motivo:
        `A reserva de US$ ${novaReservaUsd.toFixed(6)} ultrapassaria o limite de ` +
        `US$ ${limiteUsd.toFixed(2)} do período (já comprometidos US$ ${usoAtual.totalUsd.toFixed(6)}).`,
      restanteUsd: restante,
    };
  }

  return { permitido: true, restanteUsd: restante };
}

/** Os quatro níveis de alerta visual. Nenhuma notificação no sino nesta subfase (é 18-F). */
export const NIVEIS_DE_ALERTA = [70, 80, 90, 100] as const;
export type NivelDeAlerta = (typeof NIVEIS_DE_ALERTA)[number];

/**
 * O nível atingido, para a tela avisar UMA vez por nível. Sem `budget_alert_level_reached`,
 * o mesmo aviso reapareceria a cada render — e aviso repetido vira ruído que se ignora.
 */
export function nivelAtingido(
  totalUsd: number,
  limiteUsd: number | null,
): NivelDeAlerta | null {
  if (limiteUsd === null || limiteUsd <= 0) return null;
  const pct = (totalUsd / limiteUsd) * 100;
  let atingido: NivelDeAlerta | null = null;
  for (const nivel of NIVEIS_DE_ALERTA) {
    if (pct >= nivel) atingido = nivel;
  }
  return atingido;
}

/** Deve mostrar o aviso? Só quando o nível SUBIU em relação ao já registrado. */
export function deveAvisar(
  nivel: NivelDeAlerta | null,
  jaRegistrado: number,
): nivel is NivelDeAlerta {
  return nivel !== null && nivel > jaRegistrado;
}
