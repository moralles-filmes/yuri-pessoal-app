"use client";

/**
 * Fase 17-C — Treinos · Calculadora de anilhas.
 *
 * Responde "quais anilhas eu ponho de cada lado" com as anilhas que existem NAQUELE local.
 * Não sugere carga, não recomenda progressão e não estima máximo — o alvo é digitado pelo
 * usuário.
 *
 * Quando o alvo não é alcançável com o estoque, a tela diz **o que dá para montar e a
 * diferença**, em vez de um "impossível" seco que esconde que faltavam 2,5 kg.
 */
import * as React from "react";
import { Weight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatPlateWeight, plateLabel, plateSolution } from "@/lib/training/plates";
import type { TrainingLocation } from "@/lib/training/types";

export function PlateCalculatorSheet({
  open,
  onOpenChange,
  location,
  initialTargetKg,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: TrainingLocation | null;
  initialTargetKg: number | null;
  /** Aplicar a carga alcançável ao campo de peso. Escolha do usuário, nunca automática. */
  onApply?: (weightKg: number) => void;
}) {
  const bars = (location?.plates ?? []).filter((plate) => plate.kind === "barra");
  const plates = (location?.plates ?? [])
    .filter((plate) => plate.kind === "anilha")
    .map((plate) => ({ weightKg: plate.weightKg, quantity: plate.quantity }));

  const [target, setTarget] = React.useState(() =>
    initialTargetKg === null ? "" : String(initialTargetKg),
  );
  const [barKg, setBarKg] = React.useState(() => bars[0]?.weightKg ?? 20);

  // Ajuste durante o render (padrão do projeto com o React Compiler): reabrir a gaveta com
  // outro alvo atualiza o campo sem `useEffect`.
  const [lastInitial, setLastInitial] = React.useState(initialTargetKg);
  if (initialTargetKg !== lastInitial) {
    setLastInitial(initialTargetKg);
    setTarget(initialTargetKg === null ? "" : String(initialTargetKg));
  }

  const targetKg = Number(target.replace(",", "."));
  const solution = plateSolution({
    targetKg: Number.isFinite(targetKg) ? targetKg : 0,
    barWeightKg: barKg,
    plates,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Weight className="size-4 text-primary" />
            Calculadora de anilhas
          </SheetTitle>
          <SheetDescription>
            {location
              ? `Usando as anilhas cadastradas em ${location.name}.`
              : "Cadastre um local com as anilhas disponíveis em Configurações do módulo."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Carga desejada</Label>
              <Input
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                inputMode="decimal"
                type="text"
                className="mt-1.5 h-12 text-center text-lg tabular-nums"
                aria-label="Carga desejada em quilos"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Barra</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {bars.length === 0 ? (
                  <Input
                    value={String(barKg)}
                    onChange={(event) => setBarKg(Number(event.target.value.replace(",", ".")) || 0)}
                    inputMode="decimal"
                    type="text"
                    className="h-12 text-center text-lg tabular-nums"
                    aria-label="Peso da barra em quilos"
                  />
                ) : (
                  bars.map((bar) => (
                    <Button
                      key={bar.id}
                      type="button"
                      variant={bar.weightKg === barKg ? "default" : "outline"}
                      className="h-12"
                      onClick={() => setBarKg(bar.weightKg)}
                    >
                      {formatPlateWeight(bar.weightKg)}
                    </Button>
                  ))
                )}
              </div>
            </div>
          </div>

          {solution.ok ? (
            <div
              className={cn(
                "rounded-xl border p-4",
                solution.isExact ? "border-primary bg-primary/5" : "bg-muted/40",
              )}
            >
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Por lado da barra
              </p>
              <p className="mt-1 text-lg font-medium">{plateLabel(solution.perSide)}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Total montado: <strong>{formatPlateWeight(solution.achievedKg)}</strong>
                {!solution.isExact && (
                  <>
                    {" "}
                    ·{" "}
                    {solution.differenceKg < 0
                      ? `faltam ${formatPlateWeight(Math.abs(solution.differenceKg))} para o alvo`
                      : `passa ${formatPlateWeight(solution.differenceKg)} do alvo`}
                  </>
                )}
              </p>
              {onApply && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    onApply(solution.achievedKg);
                    onOpenChange(false);
                  }}
                >
                  Usar {formatPlateWeight(solution.achievedKg)}
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              {solution.message}
              {solution.closestKg !== null && (
                <> O mínimo com esta barra é {formatPlateWeight(solution.closestKg)}.</>
              )}
            </div>
          )}

          {plates.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Disponíveis no local
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {plates
                  .map((plate) => `${plate.quantity} × ${formatPlateWeight(plate.weightKg)}`)
                  .join(" · ")}
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
