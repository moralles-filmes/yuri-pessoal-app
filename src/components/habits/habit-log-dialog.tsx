"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { logHabit } from "@/lib/actions/habits";
import { mapServerFieldErrors, serverErrorMessage } from "@/lib/forms/server-errors";
import { HABIT_UNIT_LABELS, type HabitUnit } from "@/lib/habits/constants";
import { formatDate } from "@/lib/format";

/** Campos que a tela pode ter. `log_date` não é campo (é a descrição): erro nele sobe para o toast. */
type Campo = "value" | "notes";

/**
 * Registro pontual de um hábito num dia (valor exato + observações). Reutilizado
 * pelos cards de hoje e pelas telas especializadas (leitura/exercícios). Grava via
 * `logHabit` (upsert por dia — não duplica). `is_done` é derivado da meta na action.
 *
 * REDESIGN-07-B · D6 — erro de campo devolvido pela action aparece SOB o campo (com
 * `aria-invalid` + `aria-describedby`); o que não tem campo na tela sobe para o toast com o
 * nome (`mapServerFieldErrors`). Antes, o toast dizia "Verifique os campos destacados." e
 * nada estava destacado.
 */
export function HabitLogDialog({
  habitId,
  habitName,
  unit,
  logDate,
  initialValue,
  initialNotes,
  showNotes = true,
  open,
  onOpenChange,
}: {
  habitId: string;
  habitName: string;
  unit: HabitUnit;
  logDate: string;
  initialValue: number;
  initialNotes?: string | null;
  showNotes?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(String(initialValue || ""));
  const [notes, setNotes] = React.useState(initialNotes ?? "");
  const [busy, setBusy] = React.useState(false);
  const [erros, setErros] = React.useState<Partial<Record<Campo, string>>>({});

  // Reinicia os campos quando o diálogo abre (padrão "ajustar estado ao mudar prop",
  // em render — evita setState dentro de efeito).
  const [wasOpen, setWasOpen] = React.useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValue(initialValue ? String(initialValue) : "");
      setNotes(initialNotes ?? "");
      setErros({});
    }
  }

  async function save() {
    setBusy(true);
    setErros({});
    try {
      const res = await logHabit(habitId, {
        log_date: logDate,
        value: Number(value.replace(",", ".")) || 0,
        notes: notes,
      });
      if (res.ok) {
        toast.success("Registro salvo.");
        onOpenChange(false);
        router.refresh();
      } else {
        const campos: Campo[] = showNotes ? ["value", "notes"] : ["value"];
        const mapped = mapServerFieldErrors(res.fieldErrors, campos);
        setErros(Object.fromEntries(mapped.toSet.map((e) => [e.name.split(".")[0], e.message])));
        toast.error(serverErrorMessage(res.error ?? "Não foi possível salvar.", mapped));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar — {habitName}</DialogTitle>
          <DialogDescription>{formatDate(logDate)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="habit-log-value">
              Quanto ({HABIT_UNIT_LABELS[unit]})
            </Label>
            <Input
              id="habit-log-value"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={erros.value ? true : undefined}
              aria-describedby={erros.value ? "habit-log-value-erro" : undefined}
              autoFocus
            />
            {erros.value && (
              <p id="habit-log-value-erro" className="text-xs text-destructive">
                {erros.value}
              </p>
            )}
          </div>
          {showNotes && (
            <div className="space-y-1.5">
              <Label htmlFor="habit-log-notes">Observações</Label>
              <Textarea
                id="habit-log-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="O que foi feito hoje…"
                aria-invalid={erros.notes ? true : undefined}
                aria-describedby={erros.notes ? "habit-log-notes-erro" : undefined}
              />
              {erros.notes && (
                <p id="habit-log-notes-erro" className="text-xs text-destructive">
                  {erros.notes}
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
