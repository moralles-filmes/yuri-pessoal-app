"use client";

/**
 * Fase 17-E — Treinos · Evolução corporal dentro do módulo de Treinos.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ NADA AQUI É UMA SEGUNDA FONTE DE PESO.                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Este painel LÊ e ESCREVE nas tabelas `body_*` (16-E) pelas mesmas funções que o módulo
 * Dieta usa — `src/lib/body/measurements.ts` (puro), `src/lib/actions/body-measurements.ts`
 * (gravação) e os componentes `src/components/body/*`. Um peso registrado aqui aparece lá, e
 * vice-versa: não existe tabela de medida corporal dentro de `training_*`.
 *
 * ═══════════ CORRELAÇÃO NÃO É CAUSA ═══════════
 *
 * Treino e corpo aparecem lado a lado porque é útil ver os dois juntos. Em nenhum momento a
 * tela afirma que o treino causou a mudança corporal — nem o contrário. O aviso é explícito.
 *
 * ═══════════ BURACO NÃO É ZERO ═══════════
 *
 * Dia sem medição vale `null`: a linha do gráfico INTERROMPE (`connectNulls={false}` mora no
 * `MeasurementChart`) e a média móvel só aparece com a janela cheia.
 */
import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, Plus, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import { MeasurementChart, MeasurementTable } from "@/components/body/measurement-chart";
import { ProgressPhotos } from "@/components/body/progress-photos";
import {
  buildSeries,
  formatDelta,
  formatMeasurement,
  formatPercent,
  hasEnoughForMovingAverage,
  measuredPoints,
  registrationFrequency,
  summarizeType,
} from "@/lib/body/measurements";
import type { MeasurementType, MeasurementWithType, SignedProgressPhoto } from "@/lib/body/types";
import { addDaysIso } from "@/lib/training/schedule";

// ⛔ objeto literal escrito ali mesmo — o compilador o lê estaticamente (regra 4 do carregamento sob demanda)
const RegisterMeasurementDialog = dynamic(
  () => import("./register-measurement-dialog").then((m) => m.RegisterMeasurementDialog),
  { ssr: false },
);

const MOVING_WINDOW = 7;

export function BodyEvolution({
  types,
  measurements,
  photos,
  hoje,
  days = 180,
}: {
  types: MeasurementType[];
  measurements: MeasurementWithType[];
  photos: SignedProgressPhoto[];
  hoje: string;
  days?: number;
}) {
  const router = useRouter();
  const active = types.filter((type) => type.isActive);

  const [typeId, setTypeId] = React.useState<string>(
    () => active.find((type) => type.slug === "peso")?.id ?? active[0]?.id ?? "",
  );
  const [registerOpen, setRegisterOpen] = React.useState(false);
  const registerMeasurementDialogMontado = useLazyDialog(registerOpen);

  const type = active.find((item) => item.id === typeId) ?? active[0] ?? null;
  const ofType = React.useMemo(
    () => (type ? measurements.filter((item) => item.typeId === type.id) : []),
    [measurements, type],
  );

  const from = addDaysIso(hoje, -days);
  const series = React.useMemo(
    () => buildSeries(ofType, from, hoje, MOVING_WINDOW),
    [ofType, from, hoje],
  );
  const summary = summarizeType(ofType);
  const frequency = registrationFrequency(ofType, from, hoje);
  const measuredCount = measuredPoints(series).length;

  if (active.length === 0) {
    return (
      <EmptyState
        icon={Scale}
        title="Nenhum tipo de medida cadastrado"
        description="Os tipos padrão são criados na primeira visita à tela de medidas. Abra-a uma vez e volte aqui."
      >
        <Button asChild variant="outline">
          <Link href="/nutricao/medidas">Abrir medidas e evolução</Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      {/* O aviso que a subfase exige: nada de causalidade. */}
      <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Treino e corpo são mostrados <strong>lado a lado</strong>, não como causa e efeito.
          Peso e medidas variam com hidratação, sono, alimentação, horário e método de medição —
          o sistema registra o número e não interpreta o motivo. Estes dados são os{" "}
          <strong>mesmos</strong> do módulo de Dieta:{" "}
          <Link href="/nutricao/medidas" className="underline underline-offset-2">
            medidas e evolução
          </Link>
          .
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={type?.id ?? ""} onValueChange={setTypeId}>
          <SelectTrigger className="h-9 w-[240px]" aria-label="Medida corporal">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {active.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name} ({item.unit})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" variant="outline" onClick={() => setRegisterOpen(true)}>
          <Plus className="size-4" />
          Registrar medida
        </Button>
      </div>

      {type && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Atual"
              value={
                summary.current === null
                  ? "—"
                  : formatMeasurement(summary.current, type.unit, type.decimals)
              }
              icon={Scale}
              hint={summary.currentDate ?? "sem registro"}
            />
            <StatCard
              label="Inicial"
              value={
                summary.initial === null
                  ? "—"
                  : formatMeasurement(summary.initial, type.unit, type.decimals)
              }
              icon={Scale}
              hint={summary.initialDate ?? "sem registro"}
            />
            <StatCard
              label="Variação"
              value={
                summary.delta === null
                  ? "—"
                  : formatDelta(summary.delta.absolute, type.unit, type.decimals)
              }
              icon={Scale}
              hint={summary.delta === null ? "precisa de 2 medições" : formatPercent(summary.delta.percent)}
            />
            <StatCard
              label="Registros"
              value={String(summary.count)}
              icon={Scale}
              hint={
                frequency.lastDate
                  ? `${frequency.daysWithRecord} dia(s) nos últimos ${days}`
                  : "nenhum no período"
              }
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{type.name}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Últimos {days} dias. Dia sem medição interrompe a linha —{" "}
                <strong>a ausência não é zero</strong>.
                {measuredCount > 0 && !hasEnoughForMovingAverage(measuredCount, MOVING_WINDOW) && (
                  <>
                    {" "}
                    A média móvel de {MOVING_WINDOW} medições ainda não aparece: são{" "}
                    {measuredCount} registro(s).
                  </>
                )}
              </p>
            </CardHeader>
            <CardContent>
              {measuredCount === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma medição de {type.name.toLowerCase()} nos últimos {days} dias.
                </p>
              ) : (
                <>
                  <MeasurementChart
                    series={series}
                    unit={type.unit}
                    decimals={type.decimals}
                    showAverage={hasEnoughForMovingAverage(measuredCount, MOVING_WINDOW)}
                  />
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      Ver os números em tabela
                    </summary>
                    <div className="mt-2">
                      <MeasurementTable
                        series={series}
                        unit={type.unit}
                        decimals={type.decimals}
                        caption={`Medições de ${type.name} nos últimos ${days} dias`}
                      />
                    </div>
                  </details>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* As fotos reusam o componente do módulo central: bucket privado, URL assinada curta. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Fotos de evolução</CardTitle>
          <p className="text-xs text-muted-foreground">
            Guardadas em armazenamento <strong>privado</strong>, com link temporário gerado a cada
            visualização. Não há link público e as fotos não entram em exportação nenhuma.
          </p>
        </CardHeader>
        <CardContent>
          <ProgressPhotos photos={photos} hoje={hoje} onChanged={() => router.refresh()} />
        </CardContent>
      </Card>

      {registerMeasurementDialogMontado && (
        <RegisterMeasurementDialog
          open={registerOpen}
          onOpenChange={setRegisterOpen}
          types={active}
          defaultTypeId={type?.id ?? ""}
          hoje={hoje}
          onSaved={() => {
            setRegisterOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
