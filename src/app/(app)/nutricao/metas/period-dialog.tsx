"use client";

import * as React from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { longDateLabel } from "@/lib/nutrition/calendar";
import {
  GOAL_TYPES,
  GOAL_TYPE_HINTS,
  GOAL_TYPE_LABELS,
  type GoalType,
} from "@/lib/nutrition/constants";
import type { GoalPeriod } from "@/lib/nutrition/types";

export function PeriodDialog({
  mode,
  onOpenChange,
  hoje,
  period,
  onConfirm,
}: {
  mode: "novo" | "editar" | "suceder" | null;
  onOpenChange: (open: boolean) => void;
  hoje: string;
  period: GoalPeriod | null;
  onConfirm: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [startsOn, setStartsOn] = React.useState(hoje);
  const [endsOn, setEndsOn] = React.useState("");
  const [goalType, setGoalType] = React.useState<GoalType>("fixa");
  const [saving, setSaving] = React.useState(false);

  const [lastMode, setLastMode] = React.useState(mode);
  if (mode !== lastMode) {
    setLastMode(mode);
    if (mode) {
      setName(mode === "editar" ? (period?.name ?? "") : "");
      setReason(mode === "editar" ? (period?.reason ?? "") : "");
      setStartsOn(mode === "editar" ? (period?.startsOn ?? hoje) : hoje);
      setEndsOn(mode === "editar" ? (period?.endsOn ?? "") : "");
      setGoalType(mode === "editar" ? (period?.goalType ?? "fixa") : "fixa");
      setSaving(false);
    }
  }

  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "editar"
              ? "Editar período"
              : mode === "suceder"
                ? "Começar novo período"
                : "Novo período de meta"}
          </DialogTitle>
          <DialogDescription>
            {mode === "editar" ? (
              <>
                Editar altera a meta de <strong>todos os dias já vividos</strong> dentro deste
                período. Se o objetivo mudou, prefira “Começar novo período”.
              </>
            ) : mode === "suceder" ? (
              <>
                O período atual será encerrado na véspera da data escolhida, preservando os
                relatórios anteriores. Nada do que já foi registrado muda.
              </>
            ) : (
              "Nenhum valor é definido automaticamente — você escolhe os alvos depois de criar."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="period-name">Nome (opcional)</Label>
            <Input
              id="period-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: manutenção, preparação"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="period-start">Início</Label>
              <Input
                id="period-start"
                type="date"
                value={startsOn}
                onChange={(event) => setStartsOn(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="period-end">Fim (opcional)</Label>
              <Input
                id="period-end"
                type="date"
                value={endsOn}
                onChange={(event) => setEndsOn(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Vazio = vale daqui em diante.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="period-type">Como a meta varia</Label>
            <select
              id="period-type"
              value={goalType}
              onChange={(event) => setGoalType(event.target.value as GoalType)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {GOAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {GOAL_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">{GOAL_TYPE_HINTS[goalType]}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="period-reason">Motivo (opcional)</Label>
            <Textarea
              id="period-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              placeholder="Por que esta meta existe. O sistema registra, não interpreta."
            />
          </div>

          {mode === "suceder" && startsOn && (
            <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              O período atual será encerrado em {longDateLabel(startsOn)} menos um dia, e o novo
              vale a partir de {longDateLabel(startsOn)}.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!startsOn || saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm({
                name: name || undefined,
                reason: reason || undefined,
                starts_on: startsOn,
                ends_on: endsOn || undefined,
                goal_type: goalType,
              });
              setSaving(false);
            }}
          >
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
