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
import { ariaDoErro, ErroDoCampo } from "@/components/shared/erro-do-campo";
import { GOAL_DIRECTION_LABELS, GOAL_DIRECTIONS } from "@/lib/body/constants";
import { saveMeasurementGoal } from "@/lib/actions/body-measurements";
import { errosDaAction } from "@/lib/forms/mensagem-da-action";
import type { MeasurementGoal, MeasurementType } from "@/lib/body/types";

/** Campos desta tela que a action pode recusar: a mensagem aparece sob eles (D5). */
const CAMPOS = ["typeId", "direction", "targetValue", "startValue", "startsOn", "targetDate", "note"] as const;

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
  const [errosDeCampo, setErrosDeCampo] = React.useState<Record<string, string>>({});

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrosDeCampo({});
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
        const erros = errosDaAction(result, CAMPOS);
        setErrosDeCampo(erros.porCampo);
        setError(erros.texto);
        toast.error(erros.texto);
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
              <SelectTrigger id="g-type" {...ariaDoErro("g-type-erro", errosDeCampo.typeId)}>
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
            <ErroDoCampo id="g-type-erro" mensagem={errosDeCampo.typeId} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="g-direction">Quero</Label>
              <Select name="direction" defaultValue={editing?.direction ?? "reduzir"}>
                <SelectTrigger id="g-direction" {...ariaDoErro("g-direction-erro", errosDeCampo.direction)}>
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
              <ErroDoCampo id="g-direction-erro" mensagem={errosDeCampo.direction} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-target">Alvo</Label>
              <Input
                id="g-target"
                {...ariaDoErro("g-target-erro", errosDeCampo.targetValue)}
                name="targetValue"
                inputMode="decimal"
                defaultValue={editing ? String(editing.targetValue).replace(".", ",") : ""}
                required
              />
              <ErroDoCampo id="g-target-erro" mensagem={errosDeCampo.targetValue} />
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
              aria-describedby={errosDeCampo.startValue ? "g-start-hint g-start-value-erro" : "g-start-hint"}
              aria-invalid={errosDeCampo.startValue ? true : undefined}
            />
            <p id="g-start-hint" className="text-xs text-muted-foreground">
              Em branco, o sistema usa a primeira medição a partir da data de início.
            </p>
            <ErroDoCampo id="g-start-value-erro" mensagem={errosDeCampo.startValue} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="g-starts">Início</Label>
              <Input
                id="g-starts"
                {...ariaDoErro("g-starts-erro", errosDeCampo.startsOn)}
                name="startsOn"
                type="date"
                defaultValue={editing?.startsOn ?? hoje}
                required
              />
              <ErroDoCampo id="g-starts-erro" mensagem={errosDeCampo.startsOn} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-deadline">Prazo (opcional)</Label>
              <Input
                id="g-deadline"
                {...ariaDoErro("g-deadline-erro", errosDeCampo.targetDate)}
                name="targetDate"
                type="date"
                defaultValue={editing?.targetDate ?? ""}
              />
              <ErroDoCampo id="g-deadline-erro" mensagem={errosDeCampo.targetDate} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="g-note">Observação (opcional)</Label>
            <Textarea id="g-note" {...ariaDoErro("g-note-erro", errosDeCampo.note)} name="note" rows={2} defaultValue={editing?.note ?? ""} maxLength={500} />
            <ErroDoCampo id="g-note-erro" mensagem={errosDeCampo.note} />
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
