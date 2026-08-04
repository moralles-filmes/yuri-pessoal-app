/**
 * Fase 17-F — Card de Treinos no Dashboard Geral (Server Component).
 *
 * ⛔ O card é uma CASCA: todo número vem pronto de `getTrainingCardData`, que consome
 * `metrics.ts` (17-D) e `goals.ts`/`dashboards.ts` (17-E). Nenhuma conta acontece aqui.
 *
 * ⛔ SEMANA SEM TREINO NÃO É "0 kg". Quando não houve sessão, a tela diz isso com palavras —
 * um zero com cara de resultado seria pior que nenhum número. E quando o total é parcial (uma
 * série de peso corporal sem peso do dia, por exemplo), o motivo aparece escrito.
 *
 * ⛔ SEM LINGUAGEM DE CULPA. Dia livre é dia livre; treino não realizado é uma constatação com
 * um caminho ao lado, nunca uma cobrança.
 */
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { formatMeasurement } from "@/lib/body/measurements";
import { getTrainingCardData } from "@/lib/dashboard/queries";
import { formatVolumeKg } from "@/lib/training/metrics";
import { durationLabel } from "@/lib/training/history";
import {
  evolutionLink,
  goalLink,
  liveSessionLink,
  sessionLink,
  todayLink,
} from "@/lib/search/training-links";
import { Metric, MetricRow, CardEmpty } from "./primitives";

const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export async function TrainingCard({ todayIso }: { todayIso: string }) {
  const data = await getTrainingCardData(todayIso);

  if (!data.hasModule) {
    return (
      <CardEmpty>
        Nada configurado ainda.{" "}
        <Link href="/treinos" className="underline underline-offset-2">
          Abrir Treinos
        </Link>
        .
      </CardEmpty>
    );
  }

  return (
    <div className="space-y-3">
      {data.activeSession && (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium">Sessão em andamento</p>
            <p className="truncate text-xs text-muted-foreground">
              {data.activeSession.label}
            </p>
          </div>
          <Button asChild size="sm" className="w-full sm:w-auto">
            <Link href={liveSessionLink()}>Continuar treino</Link>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Metric
          label="Treinos na semana"
          value={
            data.week.target !== null
              ? `${data.week.sessions} de ${data.week.target}`
              : String(data.week.sessions)
          }
          accent={data.week.target !== null && data.week.sessions >= data.week.target}
          hint={data.week.target === null ? "sem meta semanal definida" : undefined}
        />
        <Metric
          label="Volume da semana"
          // ⛔ Sem treino na semana, o volume é INDISPONÍVEL — não é zero.
          value={data.week.volumeKg === null ? "sem treino" : formatVolumeKg(data.week.volumeKg)}
          hint={data.week.volumeKg === null ? undefined : data.volumeRule}
        />
      </div>

      {data.week.partialReason && (
        <p className="text-[0.7rem] leading-snug text-muted-foreground">
          {data.week.partialReason}
        </p>
      )}

      <div className="space-y-1.5">
        <MetricRow
          label={
            <Link href={todayLink()} className="hover:underline">
              Hoje
            </Link>
          }
          value={
            data.today ? (
              <span className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                <span className="truncate">{data.today.label}</span>
                {data.today.time && (
                  <span className="text-muted-foreground">{data.today.time}</span>
                )}
                {data.trainedToday ? (
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                    Treinado
                  </Badge>
                ) : (
                  <Badge variant="outline">{data.today.status}</Badge>
                )}
              </span>
            ) : data.trainedToday ? (
              <span className="flex items-center gap-1.5">
                Treino registrado
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                  Treinado
                </Badge>
              </span>
            ) : (
              // Sem planejamento é dia livre — e dia livre não é falha.
              <span className="text-sm font-normal text-muted-foreground">
                dia livre
              </span>
            )
          }
        />

        {data.lastSession && (
          <MetricRow
            label={
              <Link href={sessionLink(data.lastSession.id)} className="hover:underline">
                Último treino · {formatDate(data.lastSession.date)}
              </Link>
            }
            value={
              <span className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                <span className="truncate">{data.lastSession.label}</span>
                {data.lastSession.durationSeconds !== null && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {durationLabel(data.lastSession.durationSeconds)}
                  </span>
                )}
              </span>
            }
          />
        )}

        {data.goal && (
          <MetricRow
            label={
              <Link href={goalLink(data.goal.id)} className="hover:underline">
                Meta · {data.goal.name}
              </Link>
            }
            value={
              data.goal.percent === null ? (
                // Sem base para calcular, a tela diz isso — nunca "0%".
                <span className="text-sm font-normal text-muted-foreground">sem base ainda</span>
              ) : (
                `${nf.format(data.goal.percent)}%`
              )
            }
          />
        )}

        {data.weight ? (
          <MetricRow
            label={
              // As medidas são o módulo central `body_*` — o mesmo dado da Dieta.
              <Link href={evolutionLink()} className="hover:underline">
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
              <Link href={evolutionLink()} className="text-sm font-normal hover:underline">
                sem registro
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}
