import "server-only";

/**
 * Fase 18-C · Bloco 4 — IA · Os commands de Dieta. A metade que ESCREVE.
 *
 * ⚠️ ESTE É O COMMAND QUE ESCREVE EM HISTÓRICO IMUTÁVEL. `nutrition_diary_entries` congela os
 * nutrientes no ato do registro, e o total do dia soma esse jsonb para sempre — não o
 * catálogo. Não existe "corrigir depois": existe apagar e registrar de novo.
 *
 * Por isso a previsão mostra os NÚMEROS que vão ser congelados, e não uma descrição deles; e
 * por isso o snapshot é montado pelo mesmo caminho nas duas pontas.
 *
 * `executar` chama `nutrition/services.ts`, exatamente o que `addDiaryEntry` chama.
 */

import {
  excluirConsumoDoDiario,
  registrarConsumoNoDiario,
  resolverRefeicaoDoDia,
} from "@/lib/nutrition/services";
import type { Command } from "../contracts";
import {
  desfazerConsumoEntrada,
  parseComConsumo,
  preverDesfazerConsumo,
  preverRegistrarConsumo,
  registrarConsumoEntrada,
  resolverConsumo,
  rotaDoDiario,
  type DesfazerConsumoEntrada,
  type RegistrarConsumoEntrada,
} from "./nutrition-preview";

/* ══════════════════════════════════════════════════════════════════════════════════════
   1 · registrarConsumo — risco 3 (dado de saúde)
   ══════════════════════════════════════════════════════════════════════════════════════ */

export const registrarConsumo: Command = {
  name: "registrarConsumo",
  module: "nutrition",
  risk: 3,
  revalidar: ["/nutricao", "/nutricao/diario", "/dashboard"],
  /**
   * §3.6 — os campos que ESTA ação detalha na auditoria. São escalares curtos e de identidade
   * (o que, quanto, em qual refeição, em que dia). O jsonb de nutrientes NÃO entra em
   * allowlist nenhuma: ele é a segunda cópia do dado de saúde, e a invariante 20 da 18-B
   * existe para que o módulo de IA não guarde uma.
   */
  camposAuditaveis: ["food_name", "quantity", "measure_label", "diary_date", "meal_name"],
  undo: "desfazerConsumo",

  parse: parseComConsumo(registrarConsumoEntrada),
  prever: (_ctx, payload) => preverRegistrarConsumo(payload),

  async executar(ctx, payload) {
    const d = payload as RegistrarConsumoEntrada;

    /**
     * ⚠️ RESOLVE DE NOVO, na execução — como em `registrarHabito`, e pelo mesmo motivo: o
     * payload gravado guarda os NOMES que o dono disse, não os ids. Se "arroz" passou a casar
     * com outro alimento nesses 10 minutos (um alimento novo cadastrado, um renomeado), a
     * previsão recalculada difere, o hash diverge e nada é gravado.
     */
    const r = await resolverConsumo(d);

    const refeicao = await resolverRefeicaoDoDia(ctx, r.data, r.refeicao.id);
    if (!refeicao.ok) throw new Error(refeicao.erro);

    const gravado = await registrarConsumoNoDiario(ctx, {
      diaryMealId: refeicao.id,
      foodId: r.alimento.id,
      quantidade: d.quantidade,
      measureId: r.medida?.id ?? null,
    });
    if (!gravado.ok) throw new Error(gravado.erro);

    return {
      targetId: gravado.id,
      targetRoute: rotaDoDiario(r.data),
      alterados: {
        food_name: gravado.snapshot.foodNameSnapshot,
        quantity: d.quantidade,
        measure_label: gravado.snapshot.measureLabel,
        diary_date: r.data,
        meal_name: r.refeicao.name,
      },
      itens: [],
    };
  },
};

/* ══════════════════════════════════════════════════════════════════════════════════════
   2 · desfazerConsumo — o DESFAZER (§3.7)
   ══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⛔ NÃO ESTÁ NO TOOL REGISTRY. O modelo não pode propor "apague o que eu comi ontem" — apagar
 * histórico por pedido em linguagem natural é risco 4 e está fora da 18-C. Quem alcança este
 * command é o botão de desfazer da tela, sobre um item que a própria IA acabou de registrar.
 */
export const desfazerConsumo: Command = {
  name: "desfazerConsumo",
  module: "nutrition",
  risk: 3,
  revalidar: ["/nutricao", "/nutricao/diario", "/dashboard"],
  // Nada a detalhar: o registro deixa de existir, e o id já está no alvo da execução. Nome do
  // alimento não entra — seria gravar dado de saúde na auditoria para descrever uma remoção.
  camposAuditaveis: [],
  undo: null,

  parse: parseComConsumo(desfazerConsumoEntrada),
  prever: (_ctx, payload) => preverDesfazerConsumo(payload),

  async executar(ctx, payload) {
    const { entrada_id } = payload as DesfazerConsumoEntrada;

    const r = await excluirConsumoDoDiario(ctx, entrada_id);
    if (!r.ok) throw new Error(r.erro);

    return {
      targetId: entrada_id,
      // Sem rota para o item: ele não existe mais.
      targetRoute: null,
      alterados: {},
      itens: [],
    };
  },
};
