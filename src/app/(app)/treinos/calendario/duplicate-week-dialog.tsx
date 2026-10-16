"use client";

import * as React from "react";
import {
  Copy,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addDaysIso,
  startOfWeekIso,
  weekDaysIso,
} from "@/lib/training/schedule";
import {
  duplicateTrainingWeek,
} from "@/lib/actions/training-schedule";
import { mensagemDaAction } from "@/lib/forms/mensagem-da-action";
import { Field } from "@/components/training/field";
import { shortDate } from "./calendar-client";

export function DuplicateWeekDialog({
  open,
  reference,
  weekStartsOn,
  onClose,
  onSaved,
}: {
  /** Quem decide é o pai: carregado sob demanda, o diálogo fica montado e anima o fechamento. */
  open: boolean;
  reference: string;
  weekStartsOn: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const source = startOfWeekIso(reference, weekStartsOn);
  const [target, setTarget] = React.useState(addDaysIso(source, 7));
  const [conflict, setConflict] = React.useState<"pular" | "substituir">("pular");
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    const result = await duplicateTrainingWeek({
      from_week: source,
      to_week: target,
      conflict,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(mensagemDaAction(result));
      return;
    }
    toast.success(
      `${result.data.created} dia(s) copiados${result.data.skipped > 0 ? ` · ${result.data.skipped} preservados` : ""}.`,
    );
    onSaved();
  }

  const targetDays = weekDaysIso(target, weekStartsOn);

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicar semana</DialogTitle>
          <DialogDescription>
            Copia a semana de {shortDate(source)} a {shortDate(addDaysIso(source, 6))}. A cópia
            nasce toda <strong>pendente</strong> — desfecho e justificativa não são copiados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field
            label="Semana de destino"
            hint={`A semana de ${shortDate(targetDays[0])} a ${shortDate(targetDays[6])}.`}
          >
            <Input type="date" value={target} onChange={(event) => setTarget(event.target.value)} />
          </Field>

          <Field label="Quando o dia já tem algo planejado">
            <Select value={conflict} onValueChange={(value) => setConflict(value as typeof conflict)}>
              <SelectTrigger aria-label="Resolução de conflito">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pular">Preservar o que já está lá</SelectItem>
                <SelectItem value="substituir">Substituir (só o que continua pendente)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={saving} onClick={save}>
            <Copy className="size-4" />
            Duplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
