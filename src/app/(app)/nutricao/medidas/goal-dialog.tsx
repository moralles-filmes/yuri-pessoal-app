"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GOAL_DIRECTION_LABELS, GOAL_DIRECTIONS } from "@/lib/body/constants";
import { saveMeasurementGoal } from "@/lib/actions/body-measurements";
import type { MeasurementGoal, MeasurementType } from "@/lib/body/types";

export function GoalDialog({
  open,
  onOpenChange,
  types,
  defaultTypeId,
  hoje,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: MeasurementType[];
  defaultTypeId: string;
  hoje: string;
  editing: MeasurementGoal | null;
  onSaved: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await saveMeasurementGoal({
        id: editing?.id,
        typeId: data.get("typeId"),
        direction: data.get("direction"),
        startValue: data.get("startValue"),
        targetValue: data.get("targetValue"),
        startsOn: data.get("startsOn"),
        targetDate: data.get("targetDate"),
        note: data.get("note"),
      });
      if (result.ok) {
        toast.success(editing ? "Meta atualizada." : "Meta criada.");
        onOpenChange(false);
        onSaved();
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar meta" : "Definir meta"}</DialogTitle>
          <DialogDescription>
            A meta é sua: você escolhe a medida, a direção e o alvo. O sistema não sugere
            valores nem avalia o resultado.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" key={editing?.id ?? "new"}>
          <div className="space-y-1.5">
            <Label htmlFor="g-type">Medida</Label>
            <Select name="typeId" defaultValue={editing?.typeId ?? defaultTypeId}>
              <SelectTrigger id="g-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name} ({type.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="g-direction">Quero</Label>
              <Select name="direction" defaultValue={editing?.direction ?? "reduzir"}>
                <SelectTrigger id="g-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_DIRECTIONS.map((direction) => (
                    <SelectItem key={direction} value={direction}>
                      {GOAL_DIRECTION_LABELS[direction]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-target">Alvo</Label>
              <Input
                id="g-target"
                name="targetValue"
                inputMode="decimal"
                defaultValue={editing ? String(editing.targetValue).replace(".", ",") : ""}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="g-start-value">Valor de partida (opcional)</Label>
            <Input
              id="g-start-value"
              name="startValue"
              inputMode="decimal"
              defaultValue={
                editing?.startValue !== null && editing?.startValue !== undefined
                  ? String(editing.startValue).replace(".", ",")
                  : ""
              }
              aria-describedby="g-start-hint"
            />
            <p id="g-start-hint" className="text-xs text-muted-foreground">
              Em branco, o sistema usa a primeira medição a partir da data de início.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="g-starts">Início</Label>
              <Input
                id="g-starts"
                name="startsOn"
                type="date"
                defaultValue={editing?.startsOn ?? hoje}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-deadline">Prazo (opcional)</Label>
              <Input
                id="g-deadline"
                name="targetDate"
                type="date"
                defaultValue={editing?.targetDate ?? ""}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="g-note">Observação (opcional)</Label>
            <Textarea id="g-note" name="note" rows={2} defaultValue={editing?.note ?? ""} maxLength={500} />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Salvar meta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
