"use client";

import * as React from "react";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ACTIVITY_LEVELS,
  ACTIVITY_LEVEL_HINTS,
  ACTIVITY_LEVEL_LABELS,
  GOAL_DIRECTIONS,
  GOAL_DIRECTION_LABELS,
  PROFILE_SEXES,
  PROFILE_SEX_LABELS,
} from "@/lib/nutrition/constants";
import {
  ESTIMATE_DISCLAIMER,
  estimateEnergyExpenditure,
  missingForEstimate,
} from "@/lib/nutrition/goals";
import type { NutritionProfile } from "@/lib/nutrition/types";

/**
 * Perfil + estimador.
 *
 * O botão do estimador NÃO grava meta: mostra o número, a fórmula e o aviso. Quem transforma
 * isso em alvo é o usuário, digitando na tabela de metas.
 */
export function ProfileDialog({
  open,
  onOpenChange,
  profile,
  hoje,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: NutritionProfile | null;
  hoje: string;
  onConfirm: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [birthDate, setBirthDate] = React.useState(profile?.birthDate ?? "");
  const [sex, setSex] = React.useState(profile?.sex ?? "nao_informado");
  const [height, setHeight] = React.useState(profile?.heightCm ? String(profile.heightCm) : "");
  const [weight, setWeight] = React.useState(profile?.weightKg ? String(profile.weightKg) : "");
  const [activity, setActivity] = React.useState(profile?.activityLevel ?? "nao_informado");
  const [direction, setDirection] = React.useState(profile?.goalDirection ?? "nao_informado");
  const [saving, setSaving] = React.useState(false);
  const [showEstimate, setShowEstimate] = React.useState(false);

  const [lastOpen, setLastOpen] = React.useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setBirthDate(profile?.birthDate ?? "");
      setSex(profile?.sex ?? "nao_informado");
      setHeight(profile?.heightCm ? String(profile.heightCm) : "");
      setWeight(profile?.weightKg ? String(profile.weightKg) : "");
      setActivity(profile?.activityLevel ?? "nao_informado");
      setDirection(profile?.goalDirection ?? "nao_informado");
      setShowEstimate(false);
      setSaving(false);
    }
  }

  const draft = {
    sex,
    weightKg: weight ? Number(weight.replace(",", ".")) : null,
    heightCm: height ? Number(height.replace(",", ".")) : null,
    birthDate: birthDate || null,
    activityLevel: activity,
  };
  const estimate = estimateEnergyExpenditure(draft, hoje);
  const missing = missingForEstimate(draft);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Perfil nutricional</DialogTitle>
          <DialogDescription>
            Tudo aqui é opcional e informado por você. Serve para contextualizar as telas e para
            uma estimativa opcional de gasto energético.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-birth">Data de nascimento</Label>
              <Input
                id="profile-birth"
                type="date"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-sex">Sexo biológico</Label>
              <select
                id="profile-sex"
                value={sex}
                onChange={(event) => setSex(event.target.value as typeof sex)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {PROFILE_SEXES.map((value) => (
                  <option key={value} value={value}>
                    {PROFILE_SEX_LABELS[value]}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Usado apenas pela equação do estimador.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-height">Altura (cm)</Label>
              <Input
                id="profile-height"
                inputMode="decimal"
                value={height}
                onChange={(event) => setHeight(event.target.value)}
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-weight">Peso (kg)</Label>
              <Input
                id="profile-weight"
                inputMode="decimal"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                placeholder="—"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-activity">Nível de atividade</Label>
            <select
              id="profile-activity"
              value={activity}
              onChange={(event) => setActivity(event.target.value as typeof activity)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {ACTIVITY_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {ACTIVITY_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">{ACTIVITY_LEVEL_HINTS[activity]}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-direction">Objetivo declarado</Label>
            <select
              id="profile-direction"
              value={direction}
              onChange={(event) => setDirection(event.target.value as typeof direction)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {GOAL_DIRECTIONS.map((value) => (
                <option key={value} value={value}>
                  {GOAL_DIRECTION_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          {/* ── Estimador OPCIONAL ── */}
          <div className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Estimativa de gasto energético</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={missing.length > 0}
                onClick={() => setShowEstimate((current) => !current)}
              >
                <Calculator className="size-4" />
                {showEstimate ? "Ocultar" : "Calcular"}
              </Button>
            </div>

            {missing.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Faltam: {missing.join(", ")}. Sem esses dados a conta não é feita — estimar sem
                eles seria inventar.
              </p>
            ) : (
              showEstimate &&
              estimate && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-sm">
                    <strong className="tabular-nums">
                      {Math.round(estimate.total).toLocaleString("pt-BR")} kcal/dia
                    </strong>{" "}
                    <span className="text-xs text-muted-foreground">
                      (basal: {Math.round(estimate.bmr).toLocaleString("pt-BR")} kcal)
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">{estimate.formula}</p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    {ESTIMATE_DISCLAIMER}
                  </p>
                </div>
              )
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm({
                birth_date: birthDate || undefined,
                sex,
                height_cm: height || undefined,
                weight_kg: weight || undefined,
                activity_level: activity,
                goal_direction: direction,
              });
              setSaving(false);
            }}
          >
            {saving ? "Salvando…" : "Salvar perfil"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
