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
import { HABIT_UNIT_LABELS, type HabitUnit } from "@/lib/habits/constants";
import { formatDate } from "@/lib/format";

/**
 * Registro pontual de um hábito num dia (valor exato + observações). Reutilizado
 * pelos cards de hoje e pelas telas especializadas (leitura/exercícios). Grava via
 * `logHabit` (upsert por dia — não duplica). `is_done` é derivado da meta na action.
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

  // Reinicia os campos quando o diálogo abre (padrão "ajustar estado ao mudar prop",
  // em render — evita setState dentro de efeito).
  const [wasOpen, setWasOpen] = React.useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValue(initialValue ? String(initialValue) : "");
      setNotes(initialNotes ?? "");
    }
  }

  async function save() {
    setBusy(true);
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
        toast.error(res.error ?? "Não foi possível salvar.");
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
              autoFocus
            />
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
              />
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
