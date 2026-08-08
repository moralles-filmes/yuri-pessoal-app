import "server-only";

/**
 * Fase 18-C · Bloco 4 — Dieta · O SERVIÇO de registro no diário, extraído da Server Action.
 *
 * Mesmo molde de `todo/`, `habits/` e `calendar/services.ts`. Aqui, porém, a extração é mais
 * que organização: ela é a invariante 27 do módulo aplicada a um terceiro caminho.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O SNAPSHOT É MONTADO NO SERVIDOR, LENDO O CATÁLOGO, E NUNCA RECEBIDO PRONTO.          ║
 * ║                                                                                       ║
 * ║ A 16-B fixou isso para o navegador; a 16-F reforçou para o registro rápido            ║
 * ║ (`quickAddDiaryEntry` NÃO grava — ele resolve a refeição e delega); e a 18-C repete    ║
 * ║ para a IA. Três caminhos, uma gravação. Se o registro da IA montasse o próprio         ║
 * ║ snapshot, o mesmo alimento nasceria com procedência diferente do registro normal — e o ║
 * ║ histórico, que é IMUTÁVEL por desenho, teria duas verdades sobre a mesma comida.       ║
 * ║                                                                                       ║
 * ║ ⚠️ E a conversão impossível continua sendo ERRO TIPADO, nunca estimativa: sem          ║
 * ║ densidade cadastrada, g→ml falha e o registro não acontece. Um valor "aproximado" aqui ║
 * ║ entraria no histórico congelado como se fosse medição.                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import type { AuthContext } from "@/lib/actions/helpers";
import { montarSnapshotDoConsumo } from "@/lib/nutrition/diary-queries";
import { snapshotColumns } from "@/lib/nutrition/entry-columns";
import type { DiaryEntrySnapshot } from "@/lib/nutrition/types";

export type NutritionServiceContext = AuthContext;

/* ══════════════════════════════════════════════════════════════════════════════════════
   1 · A refeição do dia
   ══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Acha a refeição daquele tipo naquele dia; se não houver, cria.
 *
 * ⚠️ *Select-then-insert*, e não `upsert`: `nutrition_diary_meals` NÃO tem unique em
 * `(user_id, diary_date, meal_type_id)` — dois lanches no mesmo dia são legítimos. O único
 * índice único da tabela é PARCIAL (`planned_meal_id`), e o `ON CONFLICT` do PostgREST não
 * infere índice parcial (`42P10`, a armadilha documentada desde a 16-B).
 */
export async function resolverRefeicaoDoDia(
  ctx: NutritionServiceContext,
  data: string,
  mealTypeId: string,
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const { data: existing } = await ctx.supabase
    .from("nutrition_diary_meals")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("diary_date", data)
    .eq("meal_type_id", mealTypeId)
    .order("position")
    .limit(1);

  const found = (existing ?? [])[0];
  if (found) return { ok: true, id: found.id };

  const { data: mealType } = await ctx.supabase
    .from("nutrition_meal_types")
    .select("id,default_time")
    .eq("id", mealTypeId)
    .maybeSingle();
  if (!mealType) return { ok: false, erro: "Tipo de refeição não encontrado." };

  const { count } = await ctx.supabase
    .from("nutrition_diary_meals")
    .select("id", { count: "exact", head: true })
    .eq("diary_date", data);

  const { data: created, error } = await ctx.supabase
    .from("nutrition_diary_meals")
    .insert({
      user_id: ctx.userId,
      diary_date: data,
      meal_type_id: mealTypeId,
      planned_time: mealType.default_time,
      // O status GRAVADO continua sendo só fato. 'pendente' não existe no CHECK (16-B).
      status: "fora_do_planejamento",
      position: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !created) return { ok: false, erro: "Não foi possível criar a refeição." };
  return { ok: true, id: created.id };
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   2 · A gravação

   ⚠️ A montagem do snapshot NÃO mora aqui — ela é `montarSnapshotDoConsumo`, em
   `diary-queries.ts`. Ela só lê (catálogo + cálculo puro), e o lado da PREVISÃO precisa dela:
   é o que faz a tela mostrar exatamente os números que vão ser congelados. O teste de
   fronteira proíbe o preview de importar um arquivo de serviço, e está certo — o que estava
   errado era a função de leitura estar no arquivo de escrita.
   ══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Registra que o alimento foi usado — alimenta as ordenações "mais usados" e "recentes" do
 * catálogo. Best-effort: falhar aqui não pode derrubar o registro de consumo.
 */
async function marcarUsoDoAlimento(
  ctx: NutritionServiceContext,
  foodId: string,
): Promise<void> {
  const { data: pref } = await ctx.supabase
    .from("nutrition_food_prefs")
    .select("use_count")
    .eq("food_id", foodId)
    .maybeSingle();

  await ctx.supabase.from("nutrition_food_prefs").upsert(
    {
      user_id: ctx.userId,
      food_id: foodId,
      use_count: (pref?.use_count ?? 0) + 1,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "user_id,food_id" },
  );
}

/** A refeição do diário é do usuário? A RLS já barra; a mensagem em pt-BR vem daqui. */
export async function refeicaoEhDoUsuario(
  ctx: NutritionServiceContext,
  mealId: string,
): Promise<boolean> {
  const { data } = await ctx.supabase
    .from("nutrition_diary_meals")
    .select("id")
    .eq("id", mealId)
    .maybeSingle();
  return Boolean(data);
}

export type RegistrarConsumoEntradaServico = {
  readonly diaryMealId: string;
  readonly foodId: string;
  readonly quantidade: number;
  readonly measureId: string | null;
  readonly plannedItemId?: string | null;
  readonly changeKind?: string;
  readonly notes?: string | null;
};

export type RegistrarConsumoResultado =
  | { readonly ok: true; readonly id: string; readonly snapshot: DiaryEntrySnapshot }
  | { readonly ok: false; readonly erro: string };

/**
 * Grava a linha de consumo. O snapshot nasce aqui, de `montarSnapshotDoConsumo`, e é congelado
 * em `nutrition_diary_entries` — o total do dia soma esse jsonb, nunca o catálogo.
 */
export async function registrarConsumoNoDiario(
  ctx: NutritionServiceContext,
  entrada: RegistrarConsumoEntradaServico,
): Promise<RegistrarConsumoResultado> {
  if (!(await refeicaoEhDoUsuario(ctx, entrada.diaryMealId))) {
    return { ok: false, erro: "Refeição não encontrada." };
  }

  const montado = await montarSnapshotDoConsumo(
    entrada.foodId,
    entrada.quantidade,
    entrada.measureId,
  );
  if (!montado.ok) return { ok: false, erro: montado.erro };

  const { count } = await ctx.supabase
    .from("nutrition_diary_entries")
    .select("id", { count: "exact", head: true })
    .eq("diary_meal_id", entrada.diaryMealId);

  const { data: created, error } = await ctx.supabase
    .from("nutrition_diary_entries")
    .insert({
      user_id: ctx.userId,
      diary_meal_id: entrada.diaryMealId,
      food_id: entrada.foodId,
      entry_kind: "alimento",
      planned_item_id: entrada.plannedItemId ?? null,
      change_kind: entrada.changeKind ?? "extra",
      changed_at: entrada.plannedItemId ? new Date().toISOString() : null,
      notes: entrada.notes ?? null,
      position: count ?? 0,
      ...snapshotColumns(montado.snapshot),
    })
    .select("id")
    .single();

  if (error || !created) {
    // O unique parcial (user_id, diary_meal_id, planned_item_id) é o que impede duplicar ao
    // confirmar a mesma refeição planejada duas vezes.
    return {
      ok: false,
      erro:
        error?.code === "23505"
          ? "Este item do planejamento já foi registrado nesta refeição."
          : "Não foi possível registrar o consumo.",
    };
  }

  await marcarUsoDoAlimento(ctx, entrada.foodId);
  return { ok: true, id: created.id, snapshot: montado.snapshot };
}

/**
 * Apaga a linha de consumo. É o `undo` declarado de `registrarConsumo`.
 *
 * ⚠️ APAGAR, e não "zerar a quantidade" — a invariante 1 do módulo. Zerar diria que o dono
 * comeu nada daquele alimento; apagar diz que não há registro, que é a verdade depois de
 * desfazer. O total do dia volta a ser o que era, e o histórico não ganha uma medição falsa.
 */
export async function excluirConsumoDoDiario(
  ctx: NutritionServiceContext,
  entryId: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { error } = await ctx.supabase
    .from("nutrition_diary_entries")
    .delete()
    .eq("id", entryId);
  if (error) return { ok: false, erro: "Não foi possível excluir o item." };
  return { ok: true };
}
