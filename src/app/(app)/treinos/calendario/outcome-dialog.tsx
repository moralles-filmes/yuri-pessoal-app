"use client";

import * as React from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ScheduledWorkout } from "@/lib/training/types";
import {
  setScheduledWorkoutOutcome,
} from "@/lib/actions/training-schedule";
import { shortDate } from "./calendar-client";

export function OutcomeDialog({
  open,
  entry,
  onClose,
  onSaved,
}: {
  /** Quem decide é o pai: carregado sob demanda, o diálogo fica montado e anima o fechamento. */
  open: boolean;
  entry: ScheduledWorkout;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = React.useState<"planejado" | "nao_realizado" | "cancelado">(
    entry.status === "nao_realizado" || entry.status === "cancelado" ? entry.status : "nao_realizado",
  );
  const [reason, setReason] = React.useState(entry.skipReason ?? "");
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    const result = await setScheduledWorkoutOutcome({ id: entry.id, status, reason });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Registrado.");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Desfecho de {shortDate(entry.scheduledDate)}</DialogTitle>
          <DialogDescription>
            Registrar um treino como <strong>concluído</strong> é papel da sessão ao vivo, que
            chega na Subfase 17-C. Aqui você marca o que não aconteceu — e por quê.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {(
            [
              ["nao_realizado", "Não realizado", "Estava planejado e não aconteceu."],
              ["cancelado", "Cancelado", "Não conta como falha na aderência."],
              ["planejado", "Voltar a pendente", "Desfaz o registro e limpa a justificativa."],
            ] as const
          ).map(([value, label, description]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                status === value ? "border-primary/50 bg-primary/5" : "hover:bg-accent",
              )}
            >
              <input
                type="radio"
                name="desfecho"
                checked={status === value}
                onChange={() => setStatus(value)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{description}</span>
              </span>
            </label>
          ))}

          {status !== "planejado" && (
            <div>
              <Label className="text-xs text-muted-foreground" htmlFor="justificativa">
                Justificativa (opcional)
              </Label>
              <Textarea
                id="justificativa"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
                className="mt-1.5"
                placeholder="Viagem, dor no ombro, academia fechada…"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={saving} onClick={save}>
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
