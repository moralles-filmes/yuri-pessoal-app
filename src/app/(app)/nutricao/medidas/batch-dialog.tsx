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
import {
  MEASUREMENT_CATEGORY_LABELS,
  MEASUREMENT_CATEGORY_ORDER,
  MEASUREMENT_CONDITION_LABELS,
  MEASUREMENT_CONDITIONS,
} from "@/lib/body/constants";
import { saveMeasurementBatch } from "@/lib/actions/body-measurements";
import { errosDaAction } from "@/lib/forms/mensagem-da-action";
import type { MeasurementType } from "@/lib/body/types";

/** Campos desta tela que a action pode recusar: a mensagem aparece sob eles (D5). */
const CAMPOS = ["measuredOn", "measuredAt", "condition", "note", "values"] as const;

export function BatchDialog({
  open,
  onOpenChange,
  types,
  hoje,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: MeasurementType[];
  hoje: string;
  onSaved: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [errosDeCampo, setErrosDeCampo] = React.useState<Record<string, string>>({});

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrosDeCampo({});
    const data = new FormData(event.currentTarget);

    // Campo em branco é IGNORADO, não gravado como zero: quem não mediu o pescoço hoje não
    // mediu 0 cm de pescoço.
    const values = types
      .map((type) => ({ typeId: type.id, value: String(data.get(`v-${type.id}`) ?? "").trim() }))
      .filter((item) => item.value !== "");

    if (values.length === 0) {
      setError("Preencha ao menos uma medida.");
      return;
    }

    startTransition(async () => {
      const result = await saveMeasurementBatch({
        measuredOn: data.get("measuredOn"),
        measuredAt: data.get("measuredAt"),
        condition: data.get("condition") === "nenhuma" ? "" : data.get("condition"),
        note: data.get("note"),
        values,
      });
      if (result.ok) {
        toast.success(`${result.data.count} medida(s) registrada(s).`);
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sessão de medidas</DialogTitle>
          <DialogDescription>
            Registre várias medidas do mesmo momento. Deixe em branco o que não mediu — campo
            vazio não vira zero.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="b-date">Data</Label>
              <Input id="b-date" {...ariaDoErro("b-date-erro", errosDeCampo.measuredOn)} name="measuredOn" type="date" defaultValue={hoje} required />
              <ErroDoCampo id="b-date-erro" mensagem={errosDeCampo.measuredOn} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-time">Horário</Label>
              <Input id="b-time" {...ariaDoErro("b-time-erro", errosDeCampo.measuredAt)} name="measuredAt" type="time" />
              <ErroDoCampo id="b-time-erro" mensagem={errosDeCampo.measuredAt} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-condition">Condição</Label>
              <Select name="condition" defaultValue="nenhuma">
                <SelectTrigger id="b-condition" {...ariaDoErro("b-condition-erro", errosDeCampo.condition)}>
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
              <ErroDoCampo id="b-condition-erro" mensagem={errosDeCampo.condition} />
            </div>
          </div>

          <div className="space-y-3">
            {MEASUREMENT_CATEGORY_ORDER.filter((category) =>
              types.some((type) => type.category === category),
            ).map((category) => (
              <div key={category} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {MEASUREMENT_CATEGORY_LABELS[category]}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {types
                    .filter((type) => type.category === category)
                    .map((type) => (
                      <div key={type.id} className="flex items-center gap-2">
                        <Label htmlFor={`v-${type.id}`} className="min-w-0 flex-1 truncate text-sm font-normal">
                          {type.name}
                        </Label>
                        <Input
                          id={`v-${type.id}`}
                          name={`v-${type.id}`}
                          inputMode="decimal"
                          className="w-24"
                          placeholder={type.unit}
                          aria-label={`${type.name} em ${type.unit}`}
                        />
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
          <ErroDoCampo id="b-values-erro" mensagem={errosDeCampo.values} />

          <div className="space-y-1.5">
            <Label htmlFor="b-note">Observação (opcional)</Label>
            <Textarea id="b-note" {...ariaDoErro("b-note-erro", errosDeCampo.note)} name="note" rows={2} maxLength={500} />
            <ErroDoCampo id="b-note-erro" mensagem={errosDeCampo.note} />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
