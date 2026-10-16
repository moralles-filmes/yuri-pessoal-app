"use client";

import * as React from "react";
import {
  Loader2,
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
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/training/field";
import type { ResolvedGoal } from "@/lib/training/goal-queries";
import {
  recordGoalProgress,
} from "@/lib/actions/training-goals";
import { mensagemDaAction } from "@/lib/forms/mensagem-da-action";

export function RecordProgressDialog({
  goal,
  hoje,
  onClose,
  onSaved,
}: {
  goal: ResolvedGoal | null;
  hoje: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = React.useState("");
  const [date, setDate] = React.useState(hoje);
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Ajuste durante o render (React Compiler ligado) — sem setState em useEffect.
  const key = goal?.goal.id ?? "";
  const [lastKey, setLastKey] = React.useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setValue("");
    setDate(hoje);
    setNote("");
  }

  async function submit() {
    if (!goal) return;
    setSaving(true);
    const result = await recordGoalProgress({
      goal_id: goal.goal.id,
      recorded_on: date,
      value,
      note,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(mensagemDaAction(result));
      return;
    }
    toast.success("Progresso registrado.");
    onSaved();
  }

  return (
    <Dialog open={Boolean(goal)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar progresso</DialogTitle>
          <DialogDescription>
            {goal?.goal.name}. O valor entra no histórico da meta com a data informada — nada é
            sobrescrito.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label={`Valor (${goal?.unit ?? ""})`}>
            <Input
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="0"
              autoFocus
            />
          </Field>
          <Field label="Data">
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Observação (opcional)">
            <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || value.trim() === ""}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
