"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import { registrarRecebimentoSchema } from "@/lib/validators/receivable";
import { registrarRecebimentoAction } from "@/lib/actions/receivables";
import { mapServerFieldErrors, serverErrorMessage } from "@/lib/forms/server-errors";

const schema = registrarRecebimentoSchema.omit({ receivable_id: true });
const FORM_FIELDS = ["valor", "recebido_em", "observacoes"] as const;
type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

function toDefaults(saldo: number, dataPadrao: string): FormInput {
  return { valor: saldo.toFixed(2).replace(".", ","), recebido_em: dataPadrao, observacoes: "" };
}

export function RegistrarRecebimentoDialog({
  open, onOpenChange, receivableId, saldo, pessoa, dataPadrao,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receivableId: string;
  saldo: number;
  pessoa: string;
  dataPadrao: string;
}) {
  const router = useRouter();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(saldo, dataPadrao),
  });
  const chave = `${receivableId}:${open}`;
  const [ultimaChave, setUltimaChave] = React.useState(chave);
  if (chave !== ultimaChave) {
    setUltimaChave(chave);
    if (open) form.reset(toDefaults(saldo, dataPadrao));
  }

  async function onSubmit(valores: FormOutput) {
    const res = await registrarRecebimentoAction({ receivable_id: receivableId, ...valores });
    if (!res.ok) {
      const mapeado = mapServerFieldErrors(res.fieldErrors, FORM_FIELDS);
      for (const { name, message } of mapeado.toSet) {
        form.setError(name as keyof FormInput, { type: "server", message });
      }
      toast.error(serverErrorMessage(res.error, mapeado));
      return;
    }
    toast.success("Recebimento registrado.");
    onOpenChange(false);
    router.refresh();
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar recebimento</DialogTitle>
          <DialogDescription className="min-w-0 break-words">
            {pessoa} · restam {formatCurrency(saldo)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="min-w-0 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="recebimento-valor">Valor</Label>
            <Input id="recebimento-valor" inputMode="decimal"
              aria-invalid={Boolean(errors.valor)} {...form.register("valor")} />
            {errors.valor && <p className="text-xs text-destructive">{errors.valor.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recebimento-data">Data do recebimento</Label>
            <Input id="recebimento-data" type="date"
              aria-invalid={Boolean(errors.recebido_em)} {...form.register("recebido_em")} />
            {errors.recebido_em && <p className="text-xs text-destructive">{errors.recebido_em.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recebimento-observacoes">Observações</Label>
            <Textarea id="recebimento-observacoes"
              aria-invalid={Boolean(errors.observacoes)} {...form.register("observacoes")} />
            {errors.observacoes && <p className="text-xs text-destructive">{errors.observacoes.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando…" : "Registrar recebimento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
