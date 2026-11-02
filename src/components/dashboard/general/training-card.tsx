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
import { getTrainingCardData } from "@/lib/dashboard/queries";
import type { EstadoDoDiaNaSemana } from "@/lib/dashboard/treinos-semana";
import { formatVolumeKg } from "@/lib/training/metrics";
import { liveSessionLink, todayLink } from "@/lib/search/training-links";
import { cn } from "@/lib/utils";
import { CardEmpty, MetricRow, Quadro } from "./primitives";

/**
 * Barras da semana (REDESIGN-06 T12, D-06-M2). Nenhum estado é vermelho nem se chama "falta":
 * dia sem treino é dia livre (invariante 22). Cada estado tem uma palavra, para a cor não ser
 * a única pista.
 */
const BARRA_DO_ESTADO: Record<EstadoDoDiaNaSemana, { classe: string; palavra: string }> = {
  treinou: { classe: "h-12 bg-primary", palavra: "treinou" },
  planejado: { classe: "h-8 border-2 border-dashed border-primary", palavra: "planejado hoje" },
  descanso: { classe: "h-3 bg-muted border border-border", palavra: "descanso" },
  livre: { classe: "h-3 bg-muted border border-border", palavra: "dia livre" },
  a_seguir: { classe: "h-3 border border-dashed border-muted-foreground/50", palavra: "a seguir" },
};

const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

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

      <p className="text-xs text-muted-foreground">
        semana de {diaMes(data.semanaDe.de)} a {diaMes(data.semanaDe.ate)}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Quadro
          valor={
            data.week.target !== null
              ? `${data.week.sessions} de ${data.week.target}`
              : String(data.week.sessions)
          }
          rotulo={
            data.week.target === null ? "Treinos na semana · sem meta semanal definida" : "Treinos na semana"
          }
          tom={data.week.target !== null && data.week.sessions >= data.week.target ? "verde" : "neutro"}
        />
        <Quadro
          // ⛔ Sem treino na semana, o volume é INDISPONÍVEL — não é zero.
          valor={data.week.volumeKg === null ? "sem treino" : formatVolumeKg(data.week.volumeKg)}
          rotulo={
            data.week.volumeKg === null ? "Volume da semana" : `Volume da semana · ${data.volumeRule}`
          }
        />
      </div>

      {data.week.partialReason && (
        <p className="text-[0.7rem] leading-snug text-muted-foreground">
          {data.week.partialReason}
        </p>
      )}

      <div className="space-y-1.5">
        <div className="grid grid-cols-7 gap-1.5">
          {data.semana.map((dia) => {
            const barra = BARRA_DO_ESTADO[dia.estado];
            return (
              <div key={dia.data} className="flex min-w-0 flex-col items-center gap-1">
                <div className="flex h-12 w-full items-end">
                  <div
                    className={cn("w-full rounded-sm", barra.classe)}
                    title={`${dia.rotulo}: ${barra.palavra}`}
                    aria-label={`${dia.rotulo}: ${barra.palavra}`}
                  />
                </div>
                <span className="text-[0.7rem] text-muted-foreground">{dia.rotulo}</span>
              </div>
            );
          })}
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] text-muted-foreground">
          {(Object.keys(BARRA_DO_ESTADO) as EstadoDoDiaNaSemana[])
            .filter((estado) => data.semana.some((dia) => dia.estado === estado))
            .map((estado) => (
              <li key={estado} className="flex items-center gap-1">
                <span
                  aria-hidden
                  className={cn("inline-block w-3 rounded-sm", BARRA_DO_ESTADO[estado].classe, "h-2")}
                />
                {BARRA_DO_ESTADO[estado].palavra}
              </li>
            ))}
        </ul>
      </div>

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
      </div>
    </div>
  );
}
