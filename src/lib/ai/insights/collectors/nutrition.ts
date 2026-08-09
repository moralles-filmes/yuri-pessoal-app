import "server-only";

/**
 * Fase 18-E — IA · COLETOR DA DIETA. Casca fina.
 *
 * ⛔ **NENHUMA CONTA AQUI.** Todo total sai de `dayTotals`/`rangeTotals`
 * (`nutrition/diary.ts`), que entram por `calc.ts`. Eles somam o `nutrients_snapshot`
 * congelado no ato do registro — nunca o catálogo de hoje (invariante 9 da Dieta).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ DIA SEM REGISTRO NÃO É DIA DE ZERO CALORIA, E É AQUI QUE ISSO SE PERDE.             ║
 * ║                                                                                       ║
 * ║ É a invariante 20 da 16-E. A série carrega o dia sem registro como ponto com           ║
 * ║ `valor: null` — **não o omite**. Omitir faria uma semana com 3 dias registrados        ║
 * ║ parecer uma semana de 3 dias completa; contá-lo como zero diria que a pessoa passou o  ║
 * ║ dia em jejum. `temporal.ts` recusa a média quando a janela tem buraco, e o motivo diz  ║
 * ║ o tamanho dele.                                                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ **NUTRIENTE AUSENTE NÃO VIRA ZERO.** Ele não é relatado. Um `0` afirmaria "você não
 * consumiu proteína nenhuma" onde o certo é "não sei" — invariante 1 da Dieta.
 */

import { NUTRIENT_TOTAL_QUALITIES } from "@/lib/nutrition/constants";
import { dayTotals } from "@/lib/nutrition/diary";
import { getDiaryMeals } from "@/lib/nutrition/diary-queries";
import type { NutrientTotal, NutrientTotalQuality } from "@/lib/nutrition/calc";

import type {
  Indicador,
  PeriodoDoIndicador,
  PontoDaSerie,
  SerieTemporal,
} from "../contracts";
import { comparar, janelaDeDias, media, somarDias } from "../temporal";

/**
 * ⚠️ TETO DECLARADO. `getDiaryMeals` traz TODA refeição da janela; 60 dias de diário é uma
 * leitura grande e uma janela longa não melhora a leitura de uma semana. O número está aqui,
 * nomeado, em vez de escondido.
 */
export const MAX_DIAS = 60;
export const DIAS_PADRAO = 14;

const ROTA = "/nutricao/diario";

/** Os dois nutrientes que a série acompanha. Energia é o que a tela mostra primeiro. */
const CODIGO_ENERGIA = "energia";
const CODIGO_PROTEINA = "proteina";

function piorQualidade(totais: Record<string, NutrientTotal>): NutrientTotalQuality {
  let pior: NutrientTotalQuality = "exato";
  for (const total of Object.values(totais)) {
    if (
      NUTRIENT_TOTAL_QUALITIES.indexOf(total.quality) >
      NUTRIENT_TOTAL_QUALITIES.indexOf(pior)
    ) {
      pior = total.quality;
    }
  }
  return pior;
}

/**
 * `exato` e `aproximado` não são a mesma coisa, mas nenhum dos dois é `parcial`. O contrato do
 * `Indicador` tem duas qualidades, então a distinção viaja no MOTIVO — nunca some.
 */
const MOTIVO_PARCIAL =
  "pelo menos um alimento registrado não tem esse nutriente analisado na base: o total é um PISO, não o valor real";
const MOTIVO_APROXIMADO =
  "parte dos valores entrou como traço ou veio de um agregado (receita, refeição-modelo): o total é uma boa estimativa, não uma medição exata";

export type ColetaDaDieta = {
  readonly indicadores: readonly Indicador[];
  readonly periodo: PeriodoDoIndicador;
};

export async function coletarDieta(
  hoje: string,
  dias: number = DIAS_PADRAO,
): Promise<ColetaDaDieta> {
  const quantos = Math.min(Math.max(Math.trunc(dias) || DIAS_PADRAO, 2), MAX_DIAS);
  const janela = janelaDeDias(hoje, quantos);
  const de = janela[0].de;
  const ate = janela[janela.length - 1].ate;

  // UMA consulta para a janela inteira — o padrão do projeto: uma leitura ampla, derivação
  // em memória. Um `getDiaryMeals` por dia seria N+1 sobre o diário.
  const refeicoes = await getDiaryMeals(de, ate);

  const porDia = new Map<string, typeof refeicoes>();
  for (const m of refeicoes) {
    if (m.entries.length === 0) continue;
    porDia.set(m.diaryDate, [...(porDia.get(m.diaryDate) ?? []), m]);
  }

  const totaisPorDia = new Map<string, Record<string, NutrientTotal>>();
  for (const [dia, meals] of porDia) totaisPorDia.set(dia, dayTotals(meals));

  /**
   * Monta a série de um nutriente. O dia sem registro entra como ponto `null` com motivo — e
   * o nutriente AUSENTE num dia que teve registro também: são duas ausências diferentes, e
   * os motivos escritos são diferentes.
   */
  function serieDe(codigo: string, rotulo: string, unidade: string): SerieTemporal {
    const pontos: PontoDaSerie[] = janela.map((periodo) => {
      const totais = totaisPorDia.get(periodo.de);
      if (!totais) {
        return {
          periodo,
          valor: null,
          indisponivel_porque: "nenhum alimento registrado nesse dia",
          qualidade: "exato",
        };
      }
      const total = totais[codigo];
      if (!total) {
        return {
          periodo,
          valor: null,
          indisponivel_porque: `nenhum alimento registrado nesse dia tem ${rotulo.toLocaleLowerCase("pt-BR")} analisado na base`,
          qualidade: "exato",
        };
      }
      const pior = piorQualidade(totais);
      return {
        periodo,
        valor: total.amount,
        ...(pior === "parcial"
          ? { qualidade: "parcial" as const, motivo_incompleto: MOTIVO_PARCIAL }
          : pior === "aproximado"
            ? { qualidade: "parcial" as const, motivo_incompleto: MOTIVO_APROXIMADO }
            : { qualidade: "exato" as const }),
      };
    });

    return {
      id: `dieta.${codigo}`,
      modulo: "dieta",
      rotulo,
      unidade,
      rota: ROTA,
      pontos,
    };
  }

  const energia = serieDe(CODIGO_ENERGIA, "Energia", "kcal");
  const proteina = serieDe(CODIGO_PROTEINA, "Proteína", "g");

  const indicadores: Indicador[] = [];

  /**
   * ⚠️ **DIAS COM REGISTRO É UM NÚMERO MEDIDO, e ele é o mais importante da Dieta.** Sem ele,
   * um insight sobre a energia de uma semana com dois dias registrados soaria como um insight
   * sobre a semana. O `n` sozinho não bastaria: ele viaja com cada indicador, e este fala do
   * PERÍODO.
   */
  indicadores.push({
    id: "dieta.dias_com_registro",
    modulo: "dieta",
    rotulo: "Dias com registro no diário",
    valor: porDia.size,
    unidade: quantos === 1 ? "dia" : `de ${quantos} dias`,
    qualidade: "exato",
    periodo: { de, ate },
    n: quantos,
    rota: ROTA,
  });

  // A média só sai com a janela cheia — e num diário isso é comum não acontecer. Quando não
  // sai, o indicador entra assim mesmo, com o motivo: "não medi e por quê" é informação.
  for (const serie of [energia, proteina]) {
    indicadores.push(media(serie, quantos));
  }

  // O último dia com registro, comparado com o penúltimo — a leitura que a tela do diário
  // mostra lado a lado. Sem dois dias registrados, `comparar` já devolve o motivo.
  const diasRegistrados = [...totaisPorDia.keys()].sort();
  if (diasRegistrados.length >= 1) {
    const ultimo = diasRegistrados[diasRegistrados.length - 1];
    const penultimo =
      diasRegistrados.length >= 2 ? diasRegistrados[diasRegistrados.length - 2] : null;

    const doDia = (dia: string): Indicador | null => {
      const totais = totaisPorDia.get(dia);
      const total = totais?.[CODIGO_ENERGIA];
      if (!totais || !total) return null;
      const pior = piorQualidade(totais);
      return {
        id: "dieta.energia_dia",
        modulo: "dieta",
        rotulo: "Energia do dia",
        valor: total.amount,
        unidade: "kcal",
        ...(pior === "exato"
          ? { qualidade: "exato" as const }
          : {
              qualidade: "parcial" as const,
              motivo_incompleto: pior === "parcial" ? MOTIVO_PARCIAL : MOTIVO_APROXIMADO,
            }),
        periodo: { de: dia, ate: dia },
        n: 1,
        rota: ROTA,
      };
    };

    const atual = doDia(ultimo);
    if (atual) {
      indicadores.push(atual);
      const c = comparar(atual, penultimo ? doDia(penultimo) : null);
      indicadores.push(c.diferenca, c.variacao);
    }
  }

  return { indicadores, periodo: { de, ate: somarDias(ate, 0) } };
}
