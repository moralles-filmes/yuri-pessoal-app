import "server-only";

/**
 * Fase 18-C — IA · As duas ferramentas de Hábitos. CASCAS FINAS.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ NENHUM `.from()` E NENHUM `select()` NESTE ARQUIVO.                                   ║
 * ║ Tudo sai de `getHabitsDashboard(hoje)` — a MESMA leitura agregada que a tela usa. As  ║
 * ║ sequências e as taxas já vêm calculadas por `habits/streak.ts`; recalcular aqui faria ║
 * ║ a IA e a tela discordarem no primeiro ajuste de regra.                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ **A água é do módulo Hábitos** (invariante 12 da Dieta). Se a pergunta for sobre água,
 * quem responde é este módulo — a Dieta lê e linka, não duplica.
 *
 * `user_id` não aparece em lugar nenhum: a query roda sob RLS, com a sessão do usuário.
 */

import { z } from "zod";
import { getHabitsDashboard } from "@/lib/habits/queries";
import {
  HABIT_CATEGORY_LABELS,
  HABIT_FREQUENCY_LABELS,
  HABIT_UNIT_LABELS,
} from "@/lib/habits/constants";
import type { HabitConsistency, HabitWithStats } from "@/types/database";
import { hojeISO } from "@/lib/format";
import { emptyToolOutput, type ToolOutput, type ToolRef } from "../contracts";

/** ⚠️ `.strict()` nos dois: campo a mais é erro, e é por aqui que `user_id` seria barrado. */
export const getTodayInput = z.object({}).strict();
export const getStreaksInput = z.object({}).strict();

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O MÓDULO NÃO TEM ROTA POR HÁBITO — E FABRICAR UMA SERIA PIOR QUE NÃO TER.             ║
 * ║                                                                                       ║
 * ║ `/habitos` é uma tela só; a busca global também aponta todo hábito para lá            ║
 * ║ (`search/queries.ts`). Emitir uma ref por hábito encheria o "Ver dados usados" de N   ║
 * ║ links idênticos — foi exatamente o defeito que a 18-B corrigiu deduplicando as refs   ║
 * ║ de `get_records`. Então sai UMA ref, do painel, que é o que de fato existe.           ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
const REF_DO_PAINEL: ToolRef = {
  tipo: "painel_de_habitos",
  id: "habitos",
  rota: "/habitos",
};

/**
 * ⚠️ `computeConsistency` devolve `rate: 0` quando `scheduled === 0` — dentro do módulo isso é
 * inofensivo, mas relatado ao modelo viraria "sua consistência é 0%" para um hábito que
 * simplesmente **não estava agendado** na janela. É a regra "ausência de dado não é zero, e
 * não se divide por zero" (invariante 14 dos Treinos, 20 da Dieta) aplicada aqui.
 *
 * A saída não diverge da tela: os dois números medidos (`agendados`, `concluidos`) vão
 * sempre, e só a DIVISÃO é omitida quando não há denominador. A tela mostra "0%"; nós
 * descrevemos o mesmo fato — "0 de 0 dias agendados" — sem afirmar uma taxa que ninguém mediu.
 */
function taxaDe(c: HabitConsistency): {
  agendados: number;
  concluidos: number;
  taxa_percentual: number | null;
  taxa_indisponivel_porque?: string;
} {
  if (c.scheduled === 0) {
    return {
      agendados: 0,
      concluidos: c.done,
      taxa_percentual: null,
      taxa_indisponivel_porque:
        "Nenhum dia agendado nesta janela — não há denominador para uma taxa. Isso não é 0% de conclusão.",
    };
  }
  return {
    agendados: c.scheduled,
    concluidos: c.done,
    taxa_percentual: Math.round(c.rate * 100),
  };
}

function itemDoHabito(h: HabitWithStats) {
  return {
    habito: h.name,
    categoria: HABIT_CATEGORY_LABELS[h.category],
    frequencia: HABIT_FREQUENCY_LABELS[h.frequency],
    // Cai hoje? Um hábito de segunda não "falhou" no domingo — ele não estava agendado.
    agendado_hoje: h.scheduledToday,
    meta_do_dia: h.target_value,
    unidade: HABIT_UNIT_LABELS[h.unit],
    valor_de_hoje: h.todayValue,
    concluido_hoje: h.todayDone,
    sequencia_atual: h.streak,
    melhor_sequencia: h.bestStreak,
  };
}

export async function getToday(): Promise<ToolOutput> {
  const hoje = hojeISO();
  const { habits } = await getHabitsDashboard(hoje);
  const ativos = habits.filter((h) => h.is_active);

  if (ativos.length === 0) {
    return emptyToolOutput(
      habits.length === 0
        ? "Ainda não há hábito cadastrado."
        : `Não há hábito ativo — os ${habits.length} existentes estão desativados.`,
    );
  }

  const doDia = ativos.filter((h) => h.scheduledToday);
  const feitos = doDia.filter((h) => h.todayDone);

  return {
    periodo: { de: hoje, ate: hoje },
    contagem: ativos.length,
    completude: "exato",
    agregados: {
      ativos: ativos.length,
      agendados_hoje: doDia.length,
      concluidos_hoje: feitos.length,
      /**
       * ⚠️ O que falta HOJE, e nada além disso. Um hábito agendado e ainda não concluído às
       * 10h não é uma falha — o dia está em andamento, e é assim que `currentStreak` o trata
       * (hoje não conta e não quebra). O nome do campo diz "pendentes", nunca "perdidos".
       */
      pendentes_hoje: doDia.length - feitos.length,
      nao_agendados_hoje: ativos.length - doDia.length,
    },
    itens: ativos.map(itemDoHabito),
    refs: [REF_DO_PAINEL],
  };
}

export async function getStreaks(): Promise<ToolOutput> {
  const hoje = hojeISO();
  const { habits, consistency } = await getHabitsDashboard(hoje);
  const ativos = habits.filter((h) => h.is_active);

  if (ativos.length === 0) {
    return emptyToolOutput("Ainda não há hábito ativo para calcular sequências.");
  }

  const geral = taxaDe({
    scheduled: consistency.scheduled30,
    done: consistency.done30,
    rate: consistency.completionRate30,
  });

  return {
    periodo: null,
    contagem: ativos.length,
    completude: "exato",
    agregados: {
      janela_dias: 30,
      consistencia_geral_30_dias: geral,
      // A melhor sequência viva hoje, para a resposta poder citar sem somar nada.
      maior_sequencia_atual: Math.max(...ativos.map((h) => h.streak)),
      maior_sequencia_ja_alcancada: Math.max(...ativos.map((h) => h.bestStreak)),
    },
    itens: ativos.map((h) => ({
      habito: h.name,
      categoria: HABIT_CATEGORY_LABELS[h.category],
      sequencia_atual: h.streak,
      melhor_sequencia: h.bestStreak,
      ultimos_7_dias: taxaDe(h.consistency7),
      ultimos_30_dias: taxaDe(h.consistency30),
    })),
    refs: [REF_DO_PAINEL],
  };
}
