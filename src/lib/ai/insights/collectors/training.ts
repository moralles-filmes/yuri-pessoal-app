import "server-only";

/**
 * Fase 18-E — IA · COLETOR DE TREINOS. Casca fina.
 *
 * ⛔ **NENHUMA CONTA AQUI.** Os agregados saem de `aggregateSessions` (`training/metrics.ts`),
 * com as MESMAS opções da tela — invariante 12 da Fase 17. As médias e comparações saem de
 * `temporal.ts`, que agrega sobre o que ele devolve.
 *
 * ⚠️ **`Required<MetricOptions>` NÃO É ZELO DE TIPAGEM.** Com o tipo frouxo, uma opção NOVA em
 * `metrics.ts` passaria a existir para a tela e continuaria caindo no default aqui — sem erro
 * de compilação, sem teste vermelho, e com o insight relatando um número diferente do que o
 * dono vê. Foi assim que `unilateralRule` divergiu na 18-B. Com `Required`, acrescentar um
 * campo lá quebra o `tsc` aqui.
 *
 * ⚠️ **A REGRA DE CONTAGEM VIAJA COM O NÚMERO.** O mesmo treino dá volumes diferentes sob
 * regras diferentes (aquecimento dentro/fora, unilateral por lado/somado), e sem a regra ao
 * lado o total não é verificável.
 */

import { getSessionHistory } from "@/lib/training/history-queries";
import {
  type MetricOptions,
  aggregateSessions,
  volumeRuleLabel,
} from "@/lib/training/metrics";
import { getTrainingPreferences } from "@/lib/training/queries";
import type { TrainingPreferences } from "@/lib/training/types";
import type { LeituraDoDono } from "@/lib/supabase/owner";

import type { Indicador, PeriodoDoIndicador, SerieTemporal } from "../contracts";
import { comparar, janelaDeMeses, media } from "../temporal";

/**
 * ⚠️ TETO DECLARADO, E A CONSULTA PEDE **TETO + 1**.
 *
 * `getSessionHistory` corta em 500 por padrão e não avisa. Pedir uma a mais é o que
 * transforma "voltaram 500" em "existem mais de 500" — a linha extra não entra em conta
 * nenhuma, ela só prova a saturação. Onde a API não aceita `limit`, compara-se o tamanho do
 * retorno com o teto. Errar para "pode faltar coisa" é o único erro aceitável aqui.
 */
export const TETO_SESSOES = 500;

export const MAX_MESES = 12;
export const MESES_PADRAO = 4;

const ROTA = "/treinos/historico";

const opcoesDe = (prefs: TrainingPreferences): Required<MetricOptions> => ({
  includeWarmup: prefs.countWarmupInVolume,
  unilateralRule: prefs.unilateralVolumeRule,
});

export type ColetaDeTreinos = {
  readonly indicadores: readonly Indicador[];
  readonly periodo: PeriodoDoIndicador;
};

export async function coletarTreinos(
  hoje: string,
  meses: number = MESES_PADRAO,
  owner?: LeituraDoDono,
): Promise<ColetaDeTreinos> {
  const quantos = Math.min(Math.max(Math.trunc(meses) || MESES_PADRAO, 2), MAX_MESES);
  const janela = janelaDeMeses(hoje, quantos);
  const prefs = await getTrainingPreferences(owner);
  const options = opcoesDe(prefs);
  const regra = volumeRuleLabel(options);

  const porMes: {
    periodo: PeriodoDoIndicador;
    sessoes: number;
    dias: number;
    volume: number | null;
    parcial: boolean;
    motivo: string | null;
    saturou: boolean;
  }[] = [];

  for (const periodo of janela) {
    const encontradas = await getSessionHistory({
      from: periodo.de,
      to: periodo.ate,
      limit: TETO_SESSOES + 1,
      // 17-F já tinha o par, em campos separados. Aqui ele chega junto e é desmontado no
      // último instante — ver a nota de forma em `src/lib/supabase/owner.ts`.
      ...(owner ? { client: owner.client, userId: owner.userId } : {}),
    });
    const saturou = encontradas.length > TETO_SESSOES;
    const sessoes = saturou ? encontradas.slice(0, TETO_SESSOES) : encontradas;
    const p = aggregateSessions(sessoes, options);

    /**
     * ⛔ VOLUME EM KG SÓ EXISTE SE A UNIDADE `kg` FOI DECLARADA. Um mês só de corrida tem
     * `units: ["distancia"]`, e relatar `0 kg` ali diria "seu volume foi zero" a quem correu
     * 80 km — o "ausência vira zero" que a invariante 21 da 17-E proíbe. Aqui isso vira
     * `valor: null` com motivo, que é a forma que este módulo tem de dizer a mesma coisa.
     */
    const temKg = p.totals.units.includes("kg");

    porMes.push({
      periodo,
      sessoes: p.sessionCount,
      dias: p.trainedDays.length,
      volume: temKg ? p.totals.volumeKg : null,
      parcial: saturou || p.totals.quality !== "exato",
      motivo: saturou
        ? `o mês tem mais de ${TETO_SESSOES} treinos e a consulta traz os ${TETO_SESSOES} mais recentes`
        : p.totals.quality !== "exato"
          ? "parte das séries não converte em quilos (sem peso corporal do dia, ou unidade diferente)"
          : null,
      saturou,
    });
  }

  const atual = porMes[porMes.length - 1];
  const correnteFechado = janela[janela.length - 1].ate < hoje;
  const paraComparar = correnteFechado ? porMes.slice(-2) : porMes.slice(-3, -1);

  const contagem = (
    id: string,
    rotulo: string,
    valor: number,
    unidade: string,
    m: (typeof porMes)[number],
  ): Indicador => ({
    id,
    modulo: "treinos",
    rotulo,
    valor,
    unidade,
    ...(m.parcial && m.motivo
      ? { qualidade: "parcial" as const, motivo_incompleto: m.motivo }
      : { qualidade: "exato" as const }),
    periodo: m.periodo,
    n: m.sessoes,
    regra_de_contagem: regra,
    rota: ROTA,
  });

  const indicadores: Indicador[] = [
    contagem("treinos.sessoes_mes", "Treinos concluídos no mês", atual.sessoes, "sessões", atual),
    contagem("treinos.dias_mes", "Dias com treino no mês", atual.dias, "dias", atual),
  ];

  indicadores.push(
    atual.volume === null
      ? {
          id: "treinos.volume_mes",
          modulo: "treinos",
          rotulo: "Volume em quilos no mês",
          valor: null,
          indisponivel_porque:
            "nenhuma série do mês é medida em quilos — o volume em kg não se aplica a este período",
          unidade: "kg",
          qualidade: "exato",
          periodo: atual.periodo,
          n: atual.sessoes,
          regra_de_contagem: regra,
          rota: ROTA,
        }
      : contagem("treinos.volume_mes", "Volume em quilos no mês", atual.volume, "kg", atual),
  );

  if (paraComparar.length === 2) {
    const [antes, depois] = paraComparar;
    const c = comparar(
      contagem("treinos.sessoes", "Treinos concluídos no mês", depois.sessoes, "sessões", depois),
      contagem("treinos.sessoes", "Treinos concluídos no mês", antes.sessoes, "sessões", antes),
    );
    indicadores.push(c.diferenca, c.variacao);
  }

  const serie: SerieTemporal = {
    id: "treinos.sessoes",
    modulo: "treinos",
    rotulo: "Treinos concluídos no mês",
    unidade: "sessões",
    rota: ROTA,
    regra_de_contagem: regra,
    pontos: porMes.map((m) => ({
      periodo: m.periodo,
      valor: m.sessoes,
      ...(m.parcial && m.motivo
        ? { qualidade: "parcial" as const, motivo_incompleto: m.motivo }
        : { qualidade: "exato" as const }),
    })),
  };
  const fechados: SerieTemporal = correnteFechado
    ? serie
    : { ...serie, pontos: serie.pontos.slice(0, -1) };
  if (fechados.pontos.length >= 2) {
    indicadores.push(media(fechados, fechados.pontos.length));
  }

  return {
    indicadores,
    periodo: { de: janela[0].de, ate: janela[janela.length - 1].ate },
  };
}
