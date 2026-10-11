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
import { MEASUREMENT_CONDITION_LABELS, MEASUREMENT_CONDITIONS } from "@/lib/body/constants";
import { saveMeasurement } from "@/lib/actions/body-measurements";
import type { MeasurementType, MeasurementWithType } from "@/lib/body/types";

export function MeasurementDialog({
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
  editing: MeasurementWithType | null;
  onSaved: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input = {
      id: editing?.id,
      typeId: data.get("typeId"),
      measuredOn: data.get("measuredOn"),
      measuredAt: data.get("measuredAt"),
      value: data.get("value"),
      condition: data.get("condition") === "nenhuma" ? "" : data.get("condition"),
      note: data.get("note"),
    };

    startTransition(async () => {
      const result = await saveMeasurement(input);
      if (result.ok) {
        toast.success(editing ? "Medição atualizada." : "Medição registrada.");
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
          <DialogTitle>{editing ? "Editar medição" : "Registrar medição"}</DialogTitle>
          <DialogDescription>
            Anote a condição da medição: comparar jejum com pós-treino mistura contextos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" key={editing?.id ?? "new"}>
          <div className="space-y-1.5">
            <Label htmlFor="m-type">Medida</Label>
            <Select name="typeId" defaultValue={editing?.typeId ?? defaultTypeId}>
              <SelectTrigger id="m-type">
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
              <Label htmlFor="m-value">Valor</Label>
              <Input
                id="m-value"
                name="value"
                inputMode="decimal"
                defaultValue={editing ? String(editing.value).replace(".", ",") : ""}
                placeholder="72,4"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-date">Data</Label>
              <Input
                id="m-date"
                name="measuredOn"
                type="date"
                defaultValue={editing?.measuredOn ?? hoje}
                required
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-time">Horário (opcional)</Label>
              <Input id="m-time" name="measuredAt" type="time" defaultValue={editing?.measuredAt ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-condition">Condição</Label>
              <Select name="condition" defaultValue={editing?.condition ?? "nenhuma"}>
                <SelectTrigger id="m-condition">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Não informar</SelectItem>
                  {MEASUREMENT_CONDITIONS.map((condition) => (
                    <SelectItem key={condition} value={condition}>
                      {MEASUREMENT_CONDITION_LABELS[condition]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="m-note">Observação (opcional)</Label>
            <Textarea id="m-note" name="note" rows={2} defaultValue={editing?.note ?? ""} maxLength={500} />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
