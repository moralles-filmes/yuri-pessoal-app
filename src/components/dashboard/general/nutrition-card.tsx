/**
 * Fase 16-F — Card de Dieta e Alimentação no Dashboard Geral (Server Component).
 *
 * ⛔ O card é uma CASCA: todo número vem pronto de `getNutritionCardData`, que por sua vez
 * consome `reports.ts`, `diary.ts` e `body/measurements.ts`. Nenhuma conta acontece aqui.
 *
 * ⛔ DIA SEM REGISTRO NÃO É ZERO. Quando `amount` é `null`, a tela escreve "sem registro" —
 * nunca "0 kcal". E quando o total é parcial, isso aparece escrito, não só numa cor: um
 * número com cara de exato somado sobre itens sem o nutriente analisado é mentira numérica.
 */
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { formatMeasurement } from "@/lib/body/measurements";
import { getNutritionCardData } from "@/lib/dashboard/queries";
import type { DashNutrientValue } from "@/lib/dashboard/types";
import { Metric, MetricRow, CardEmpty } from "./primitives";

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
      <CardEmpty>
        Nada configurado ainda.{" "}
        <Link href="/nutricao" className="underline underline-offset-2">
          Abrir Dieta e Alimentação
        </Link>
        .
      </CardEmpty>
    );
  }

  const parcial =
    data.energy?.quality === "parcial" || data.protein?.quality === "parcial";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Metric
          label={data.energy?.label ?? "Energia"}
          value={nutrientText(data.energy)}
          accent={Boolean(data.energy?.amount !== null && data.energy?.percent !== null)}
        />
        <Metric
          label={data.protein?.label ?? "Proteína"}
          value={nutrientText(data.protein)}
        />
      </div>

      {parcial && (
        <p className="text-[0.7rem] leading-snug text-muted-foreground">
          Alguns itens de hoje não têm todos os nutrientes analisados pela fonte — os totais são
          o mínimo conhecido, não o valor real.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Metric
          label="Refeições registradas"
          value={`${data.mealsDone} de ${data.mealsTotal}`}
        />
        <Metric
          label="Pendentes"
          value={String(data.mealsPending)}
          accent={data.mealsLate > 0}
          hint={data.mealsLate > 0 ? `${data.mealsLate} passou do horário` : undefined}
        />
      </div>

      <div className="space-y-1.5">
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

        {data.adherence !== null && (
          <MetricRow
            label="Aderência de hoje"
            value={`${nf(0).format(data.adherence)}%`}
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

        {data.water && (
          <MetricRow
            label={
              // A ÁGUA É DO MÓDULO HÁBITOS — a Dieta só lê e linka para lá.
              <Link href="/habitos?view=agua" className="hover:underline">
                Água (Hábitos)
              </Link>
            }
            value={`${nf(2).format(data.water.value)} / ${nf(2).format(data.water.target)} ${data.water.unit}`}
          />
        )}

        {data.shoppingLists > 0 && (
          <MetricRow
            label={
              <Link href="/nutricao/compras" className="hover:underline">
                Lista de compras
              </Link>
            }
            value={
              data.shoppingPending > 0
                ? `${data.shoppingPending} ${data.shoppingPending === 1 ? "item" : "itens"} a pegar`
                : "tudo pego"
            }
          />
        )}

        {data.weight ? (
          <MetricRow
            label={
              <Link href="/nutricao/medidas" className="hover:underline">
                Peso · {formatDate(data.weight.measuredOn)}
              </Link>
            }
            value={
              <span className="flex items-center gap-1.5">
                {formatMeasurement(data.weight.value, data.weight.unit, data.weight.decimals)}
                {data.weight.sincePrevious !== null && data.weight.sincePrevious !== 0 && (
                  <span className="text-xs text-muted-foreground">
                    {data.weight.sincePrevious > 0 ? "+" : "−"}
                    {formatMeasurement(
                      Math.abs(data.weight.sincePrevious),
                      data.weight.unit,
                      data.weight.decimals,
                    )}
                  </span>
                )}
              </span>
            }
          />
        ) : (
          <MetricRow
            label="Peso"
            value={
              <Link href="/nutricao/medidas" className="text-sm font-normal hover:underline">
                sem registro
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}
