import "server-only";

/**
 * Fase 18-C — IA · As três ferramentas de Dieta e Alimentação. CASCAS FINAS.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ NENHUM `.from()`, NENHUM `select()` E NENHUMA SOMA PRÓPRIA.                            ║
 * ║                                                                                       ║
 * ║ Todo total sai de `nutrition/diary.ts` (`dayTotals`, `rangeTotals`), que por sua vez   ║
 * ║ entra por `calc.ts` — a invariante 2 do módulo. E o total do consumo sai do            ║
 * ║ `nutrients_snapshot` congelado no ato do registro, NUNCA do catálogo (invariante 9):   ║
 * ║ `dayTotals` já faz isso, e é por isso que ele é a única porta.                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠️ A QUALIDADE VIAJA COM O NÚMERO — É A INVARIANTE 1 DO MÓDULO, E ELA MORRE FÁCIL.     ║
 * ║                                                                                       ║
 * ║ `NutrientTotal.quality` é `exato | aproximado | parcial`. Um alimento sem o nutriente  ║
 * ║ analisado NÃO entra como zero: ele degrada o total para `parcial`. Relatar só          ║
 * ║ `amount` faria a IA apresentar um piso como se fosse o valor real — e "você consumiu   ║
 * ║ 78 g de proteína" viraria mentira quando o certo é "pelo menos 78 g".                  ║
 * ║                                                                                       ║
 * ║ Por isso `completude` do resultado é derivada da PIOR qualidade entre os nutrientes    ║
 * ║ relatados, e cada nutriente leva a sua junto.                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ **A ÁGUA NÃO ESTÁ AQUI.** Ela é do módulo Hábitos (invariante 12) — a Dieta lê e linka,
 * não duplica. Pergunta sobre água se responde por `habits.get_today`.
 *
 * `user_id` não aparece em lugar nenhum: as queries rodam sob RLS, com a sessão do usuário.
 */

import { z } from "zod";
import { getDiaryMeals, getGoalPeriods, getMealTypes } from "@/lib/nutrition/diary-queries";
import { dayTotals, rangeTotals } from "@/lib/nutrition/diary";
import { dayTargets, goalPeriodForDate, progressForDay } from "@/lib/nutrition/goals";
import { MACRO_ORDER, NUTRIENT_TOTAL_QUALITIES } from "@/lib/nutrition/constants";
import { addDaysIso } from "@/lib/nutrition/calendar";
import type { NutrientTotal, NutrientTotalQuality } from "@/lib/nutrition/calc";
import { hojeISO } from "@/lib/format";
import { emptyToolOutput, type ToolOutput, type ToolRef } from "../contracts";

/** ⚠️ `.strict()` em todos: campo a mais é erro, e é por aqui que `user_id` seria barrado. */
export const getDayInput = z
  .object({
    data: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data no formato AAAA-MM-DD.")
      .optional(),
  })
  .strict();

export const getPeriodInput = z
  .object({
    dias: z.number().int().min(2).max(90).optional(),
  })
  .strict();

export const getGoalsInput = z.object({}).strict();

const JANELA_PADRAO_DIAS = 7;

const REF_DIARIO = (dia: string): ToolRef => ({
  tipo: "diario_alimentar",
  id: dia,
  rota: `/nutricao/diario?date=${dia}`,
});

const REF_METAS: ToolRef = { tipo: "metas_nutricionais", id: "metas", rota: "/nutricao/metas" };

/**
 * A pior qualidade entre os totais relatados — é ela que vira `completude`.
 *
 * A ordem de `NUTRIENT_TOTAL_QUALITIES` é `exato | aproximado | parcial`, do melhor ao pior;
 * o índice maior é a pior. Derivar da constante em vez de escrever a ordem à mão é o que
 * impede este ponto de ficar para trás se um estado novo entrar no módulo.
 */
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

/** `exato` e `aproximado` não são a mesma coisa, mas nenhum dos dois é `parcial`. */
function completudeDe(qualidade: NutrientTotalQuality): "exato" | "parcial" {
  return qualidade === "parcial" ? "parcial" : "exato";
}

const MOTIVO_PARCIAL =
  "Pelo menos um alimento registrado não tem o valor deste nutriente analisado na base. O total é um PISO, não o valor real — diga 'pelo menos', nunca apresente como exato.";

const MOTIVO_APROXIMADO =
  "Parte dos valores entrou como traço ou veio de um agregado aproximado (receita, refeição-modelo). O total é uma boa estimativa, não uma medição exata.";

/** Os macros, no formato que o modelo lê — com a qualidade colada em cada número. */
function macrosDe(totais: Record<string, NutrientTotal>) {
  const saida: Record<string, { valor: number; qualidade: NutrientTotalQuality }> = {};
  for (const code of MACRO_ORDER) {
    const total = totais[code];
    // ⚠️ Nutriente ausente NÃO vira zero: ele simplesmente não é relatado. Um `0` aqui
    // afirmaria "você não consumiu proteína nenhuma" onde o certo é "não sei".
    if (!total) continue;
    saida[code] = { valor: total.amount, qualidade: total.quality };
  }
  return saida;
}

async function totaisDoDia(dia: string) {
  const refeicoes = await getDiaryMeals(dia, dia);
  return { refeicoes, totais: dayTotals(refeicoes) };
}

export async function getDay(input: { data?: string }): Promise<ToolOutput> {
  const dia = input.data ?? hojeISO();

  const [{ refeicoes, totais }, periodos, tiposDeRefeicao] = await Promise.all([
    totaisDoDia(dia),
    getGoalPeriods(),
    getMealTypes(),
  ]);

  const registrados = refeicoes.filter((m) => m.entries.length > 0);

  if (registrados.length === 0) {
    return {
      ...emptyToolOutput(
        `Nenhum alimento registrado no diário de ${dia}. Isso é AUSÊNCIA DE REGISTRO — não significa que a pessoa não comeu, e não é um dia de zero caloria.`,
      ),
      periodo: { de: dia, ate: dia },
      refs: [REF_DIARIO(dia)],
    };
  }

  /**
   * ⚠️ A META DE UM DIA É A QUE VALIA NELE (invariante 10). `goalPeriodForDate` resolve o
   * período vigente NAQUELA data — alterar a meta hoje não pode mudar o relatório de ontem.
   */
  const periodo = goalPeriodForDate(periodos, dia);
  const metas = dayTargets(periodo, { date: dia, dayKind: null });
  const progresso = progressForDay(totais, metas);

  const qualidade = piorQualidade(totais);
  const nomePorTipo = new Map(tiposDeRefeicao.map((t) => [t.id, t.name]));

  return {
    periodo: { de: dia, ate: dia },
    contagem: registrados.reduce((s, m) => s + m.entries.length, 0),
    completude: completudeDe(qualidade),
    ...(qualidade === "parcial"
      ? { motivo_incompleto: MOTIVO_PARCIAL }
      : qualidade === "aproximado"
        ? { motivo_incompleto: MOTIVO_APROXIMADO }
        : {}),
    agregados: {
      data: dia,
      refeicoes_com_registro: registrados.length,
      macros: macrosDe(totais),
      qualidade_do_total: qualidade,
      tem_meta_vigente: periodo !== null,
      // `percent: null` é "sem meta", e é DIFERENTE de 0%. O objeto de progresso já carrega
      // essa distinção; não a achate aqui.
      progresso: Object.fromEntries(
        MACRO_ORDER.filter((c) => progresso[c]).map((c) => [
          c,
          {
            consumido: progresso[c].consumed,
            meta: progresso[c].target,
            falta: progresso[c].remaining,
            percentual: progresso[c].percent,
            situacao: progresso[c].status,
            qualidade: progresso[c].quality,
          },
        ]),
      ),
      sem_prescricao:
        "Estes números são o registro do usuário e a meta que ELE definiu. Não sugira meta, não recomende alimento e não avalie a dieta.",
    },
    itens: registrados.map((m) => ({
      refeicao: nomePorTipo.get(m.mealTypeId) ?? m.mealTypeName,
      horario: m.consumedTime,
      itens_registrados: m.entries.length,
    })),
    refs: [REF_DIARIO(dia)],
  };
}

export async function getPeriod(input: { dias?: number }): Promise<ToolOutput> {
  const dias = input.dias ?? JANELA_PADRAO_DIAS;
  const ate = hojeISO();
  // Janela INCLUSIVA nos dois extremos: 7 dias terminando hoje é de hoje-6 até hoje.
  const de = addDaysIso(ate, -(dias - 1));

  const refeicoes = await getDiaryMeals(de, ate);

  /**
   * ⚠️ DIA SEM REGISTRO DEVOLVE `null` E NÃO ENTRA NA MÉDIA (invariante 20 da 16-E).
   *
   * `dailyAverage` do módulo divide pelos dias PEDIDOS, de propósito — é a média que a tela
   * de relatórios mostra. Aqui a pergunta é outra ("como foi minha semana?"), e dividir 3
   * dias registrados por 7 diria que a pessoa comeu metade do que comeu. Então esta
   * ferramenta NÃO calcula média: devolve o total do período e QUANTOS dias tiveram registro,
   * e deixa a divisão de fora — o prompt manda apontar os relatórios para isso.
   */
  const porDia = new Map<string, typeof refeicoes>();
  for (const m of refeicoes) {
    if (m.entries.length === 0) continue;
    porDia.set(m.diaryDate, [...(porDia.get(m.diaryDate) ?? []), m]);
  }

  if (porDia.size === 0) {
    return {
      ...emptyToolOutput(
        `Nenhum alimento registrado entre ${de} e ${ate}. Isso é ausência de registro no período — não é um período de zero caloria.`,
      ),
      periodo: { de, ate },
      refs: [REF_DIARIO(ate)],
    };
  }

  const totaisPorDia = [...porDia.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([dia, meals]) => ({ dia, totais: dayTotals(meals) }));

  // `rangeTotals` usa `mergeTotals`, e é ele que propaga a qualidade: um dia parcial torna o
  // período parcial. O número da semana não pode parecer mais preciso que os dias que o formam.
  const totais = rangeTotals(totaisPorDia.map((d) => d.totais));
  const qualidade = piorQualidade(totais);

  return {
    periodo: { de, ate },
    contagem: porDia.size,
    completude: completudeDe(qualidade),
    ...(qualidade === "parcial"
      ? { motivo_incompleto: MOTIVO_PARCIAL }
      : qualidade === "aproximado"
        ? { motivo_incompleto: MOTIVO_APROXIMADO }
        : {}),
    agregados: {
      dias_pedidos: dias,
      dias_com_registro: porDia.size,
      // A diferença entre os dois números é o que impede a IA de tratar dia sem registro
      // como dia de jejum.
      dias_sem_registro: dias - porDia.size,
      total_do_periodo: macrosDe(totais),
      qualidade_do_total: qualidade,
      observacao_da_media:
        "Esta ferramenta NÃO calcula média diária: dias sem registro são ausência de dado, não dias de zero. Para média, aponte os relatórios de Dieta.",
    },
    itens: totaisPorDia.map(({ dia, totais: t }) => ({
      data: dia,
      macros: macrosDe(t),
    })),
    refs: [REF_DIARIO(ate)],
  };
}

export async function getGoals(): Promise<ToolOutput> {
  const hoje = hojeISO();
  const periodos = await getGoalPeriods();
  const vigente = goalPeriodForDate(periodos, hoje);

  if (!vigente) {
    return {
      ...emptyToolOutput(
        periodos.length === 0
          ? "Nenhuma meta nutricional cadastrada. Não sugira uma — a meta é decisão do usuário."
          : `Nenhuma meta vigente hoje (${hoje}), embora existam ${periodos.length} período(s) cadastrado(s) para outras datas.`,
      ),
      refs: [REF_METAS],
    };
  }

  const metas = dayTargets(vigente, { date: hoje, dayKind: null });
  const codigos = Object.keys(metas);

  if (codigos.length === 0) {
    return {
      ...emptyToolOutput(
        "Há um período de meta vigente, mas ele não define alvo para nenhum nutriente do dia.",
      ),
      refs: [REF_METAS],
    };
  }

  return {
    periodo: { de: vigente.startsOn, ate: vigente.endsOn ?? hoje },
    contagem: codigos.length,
    completude: "exato",
    agregados: {
      vigente_desde: vigente.startsOn,
      vigente_ate: vigente.endsOn,
      tipo_de_meta: vigente.goalType,
      sem_prescricao:
        "Estas metas foram definidas PELO USUÁRIO. Não sugira alterá-las, não diga se estão adequadas e não proponha valores.",
    },
    itens: codigos.map((code) => ({
      nutriente: code,
      alvo: metas[code].amount,
      minimo: metas[code].min,
      maximo: metas[code].max,
    })),
    refs: [REF_METAS],
  };
}
