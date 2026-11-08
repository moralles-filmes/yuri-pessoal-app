/**
 * Fase 16-F — Card de Dieta e Alimentação no Dashboard Geral (Server Component).
 *
 * ⛔ O card é uma CASCA: todo número vem pronto de `getNutritionCardData`, que por sua vez
 * consome `reports.ts`, `diary.ts` e `body/measurements.ts`. Nenhuma conta acontece aqui.
 *
 * REDESIGN-06 T11: sai Aderência, Água (é do módulo Hábitos), Lista de compras e Peso (é de
 * `body_*`); ficam os quadros Energia/Proteína, "X de Y registradas" e a próxima refeição.
 *
 * ⛔ DIA SEM REGISTRO NÃO É ZERO. Quando `amount` é `null`, a tela escreve "sem registro" —
 * nunca "0 kcal". E quando o total é parcial, isso aparece escrito, não só numa cor: um
 * número com cara de exato somado sobre itens sem o nutriente analisado é mentira numérica.
 */
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getNutritionCardData } from "@/lib/dashboard/queries";
import type { DashNutrientValue } from "@/lib/dashboard/types";
import { Quadro, MetricRow } from "./primitives";

const nf = (digits = 0) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits });

/** "1.800 / 2.000 kcal" — ou "sem registro", que é uma resposta diferente de "0". */
function nutrientText(n: DashNutrientValue | null): string {
  if (!n) return "—";
  if (n.amount === null) return "sem registro";
  const valor = nf(0).format(n.amount);
  return n.target !== null
    ? `${valor} / ${nf(0).format(n.target)} ${n.unit}`
    : `${valor} ${n.unit}`;
}

export async function NutritionCard({
  todayIso,
  minutosAgora,
}: {
  todayIso: string;
  minutosAgora: number;
}) {
  const data = await getNutritionCardData(todayIso, minutosAgora);

  if (!data.hasModule) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-muted-foreground">Nada configurado ainda.</p>
        <Link href="/nutricao" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Configurar dieta
        </Link>
      </div>
    );
  }

  const parcial =
    data.energy?.quality === "parcial" || data.protein?.quality === "parcial";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Quadro valor={nutrientText(data.energy)} rotulo={data.energy?.label ?? "Energia"} />
        <Quadro valor={nutrientText(data.protein)} rotulo={data.protein?.label ?? "Proteína"} />
      </div>

      {parcial && (
        <p className="text-[0.7rem] leading-snug text-muted-foreground">
          Alguns itens de hoje não têm todos os nutrientes analisados pela fonte — os totais são
          o mínimo conhecido, não o valor real.
        </p>
      )}

      <div className="space-y-1.5">
        <MetricRow
          label="Refeições"
          value={`${data.mealsDone} de ${data.mealsTotal} registradas`}
        />

        {data.nextMeal && (
          <MetricRow
            label={
              <Link href="/nutricao/diario" className="hover:underline">
                Próxima refeição
              </Link>
            }
            value={
              <span className="flex items-center gap-1.5">
                {data.nextMeal.name}
                {data.nextMeal.time && (
                  <span className="text-muted-foreground">{data.nextMeal.time}</span>
                )}
                {data.nextMeal.late && (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                    Sem registro
                  </Badge>
                )}
              </span>
            }
          />
        )}

        {!data.hasRecord && (
          <p className="text-sm text-muted-foreground">
            Nada registrado hoje ainda.{" "}
            <Link href="/nutricao/diario" className="underline underline-offset-2">
              Abrir o diário
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
