"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/training/field";
import {
  MEASUREMENT_CONDITION_LABELS,
  MEASUREMENT_CONDITIONS,
} from "@/lib/body/constants";
import type { MeasurementType } from "@/lib/body/types";
import { saveMeasurement } from "@/lib/actions/body-measurements";
import { mensagemDaAction } from "@/lib/forms/mensagem-da-action";

export function RegisterMeasurementDialog({
  open,
  onOpenChange,
  types,
  defaultTypeId,
  hoje,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: MeasurementType[];
  defaultTypeId: string;
  hoje: string;
  onSaved: () => void;
}) {
  const [typeId, setTypeId] = React.useState(defaultTypeId);
  const [value, setValue] = React.useState("");
  const [date, setDate] = React.useState(hoje);
  const [condition, setCondition] = React.useState<string>("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Ajuste durante o render (React Compiler ligado) — sem setState em useEffect.
  const key = `${open}:${defaultTypeId}`;
  const [lastKey, setLastKey] = React.useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setTypeId(defaultTypeId);
    setValue("");
    setDate(hoje);
    setCondition("");
    setNote("");
  }

  const type = types.find((item) => item.id === typeId);

  async function submit() {
    setSaving(true);
    // As chaves são as do schema da 16-E (`measurementSchema`) — a unidade NÃO vai daqui:
    // ela é copiada do tipo no servidor, para não haver "80 cm" gravado numa linha de peso.
    const result = await saveMeasurement({
      typeId,
      measuredOn: date,
      measuredAt: "",
      value,
      condition: condition || "",
      note,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(mensagemDaAction(result));
      return;
    }
    toast.success("Medida registrada. Ela também aparece no módulo de Dieta.");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar medida corporal</DialogTitle>
          <DialogDescription>
            O registro vai para o módulo central de medidas — o mesmo lugar que a Dieta lê. Não
            existe uma segunda tabela de peso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Medida">
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger aria-label="Tipo de medida">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label={`Valor${type ? ` (${type.unit})` : ""}`}>
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

          <Field
            label="Condição (opcional)"
            hint="Comparar jejum com pós-treino explica parte da diferença."
          >
            <Select value={condition || "__nenhuma__"} onValueChange={(v) => setCondition(v === "__nenhuma__" ? "" : v)}>
              <SelectTrigger aria-label="Condição da medição">
                <SelectValue placeholder="Não informada" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__nenhuma__">Não informada</SelectItem>
                {MEASUREMENT_CONDITIONS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {MEASUREMENT_CONDITION_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Observação (opcional)">
            <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || value.trim() === "" || !typeId}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
