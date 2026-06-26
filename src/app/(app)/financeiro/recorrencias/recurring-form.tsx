"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoneyInput } from "@/components/financeiro/money-input";
import { applyFieldErrors } from "@/components/financeiro/form-utils";
import { createRecurring, updateRecurring } from "@/lib/actions/recurring";
import { toDateInputValue } from "@/lib/format";
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  GENERATED_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
  type Frequency,
} from "@/lib/finance/constants";
import type { RecurringTransactionRow } from "@/types/database";

const NONE = "none";
const TYPES = ["despesa", "receita", "ajuste"] as const;

type Option = { id: string; name: string };

type FormValues = {
  type: (typeof TYPES)[number];
  amount: string;
  account_id: string;
  category_id: string;
  payment_method: string;
  frequency: Frequency;
  interval_count: string;
  anchor_date: string;
  end_date: string;
  generated_status: (typeof GENERATED_STATUSES)[number];
  description: string;
  is_active: boolean;
};

function defaults(rec?: RecurringTransactionRow): FormValues {
  const today = toDateInputValue(new Date());
  const recType =
    rec && rec.type !== "transferencia" ? rec.type : "despesa";
  return {
    type: recType as (typeof TYPES)[number],
    amount: rec ? String(rec.amount).replace(".", ",") : "",
    account_id: rec?.account_id ?? NONE,
    category_id: rec?.category_id ?? NONE,
    payment_method: rec?.payment_method ?? NONE,
    frequency: rec?.frequency ?? "mensal",
    interval_count: rec ? String(rec.interval_count) : "1",
    anchor_date: rec?.anchor_date ?? today,
    end_date: rec?.end_date ?? "",
    generated_status: rec?.generated_status ?? "pago",
    description: rec?.description ?? "",
    is_active: rec?.is_active ?? true,
  };
}

export function RecurringFormDialog({
  recurrence,
  accounts,
  categories,
  trigger,
}: {
  recurrence?: RecurringTransactionRow;
  accounts: Option[];
  categories: Option[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const isEdit = Boolean(recurrence);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaults(recurrence) });

  React.useEffect(() => {
    if (open) reset(defaults(recurrence));
  }, [open, recurrence, reset]);

  async function onSubmit(values: FormValues) {
    const payload = {
      type: values.type,
      amount: values.amount,
      account_id: values.account_id === NONE ? "" : values.account_id,
      category_id: values.category_id === NONE ? "" : values.category_id,
      payment_method:
        values.payment_method === NONE ? "" : values.payment_method,
      frequency: values.frequency,
      interval_count: values.interval_count,
      anchor_date: values.anchor_date,
      next_due_date: isEdit ? recurrence!.next_due_date : values.anchor_date,
      end_date: values.end_date,
      generated_status: values.generated_status,
      description: values.description,
      is_active: values.is_active,
    };
    const res = isEdit
      ? await updateRecurring(recurrence!.id, payload)
      : await createRecurring(payload);
    if (res.ok) {
      toast.success(isEdit ? "Recorrência atualizada." : "Recorrência criada.");
      setOpen(false);
      router.refresh();
    } else {
      applyFieldErrors(setError, res.fieldErrors);
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar recorrência" : "Nova recorrência"}
          </DialogTitle>
          <DialogDescription>
            Geração automática de lançamentos (despesa, receita ou ajuste).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TRANSACTION_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <Controller
                control={control}
                name="amount"
                render={({ field }) => (
                  <MoneyInput
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Controller
                control={control}
                name="account_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sem conta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem conta</SelectItem>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Controller
                control={control}
                name="category_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sem categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem categoria</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Frequência</Label>
              <Controller
                control={control}
                name="frequency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f} value={f}>
                          {FREQUENCY_LABELS[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-interval">A cada</Label>
              <Input
                id="rec-interval"
                type="number"
                min={1}
                {...register("interval_count")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status gerado</Label>
              <Controller
                control={control}
                name="generated_status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GENERATED_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {TRANSACTION_STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rec-anchor">Início (âncora)</Label>
              <Input
                id="rec-anchor"
                type="date"
                {...register("anchor_date")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-end">Fim (opcional)</Label>
              <Input id="rec-end" type="date" {...register("end_date")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Forma de pagamento</Label>
            <Controller
              control={control}
              name="payment_method"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Nenhuma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nenhuma</SelectItem>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rec-desc">Descrição</Label>
            <Input id="rec-desc" {...register("description")} />
            {errors.amount && (
              <p className="text-xs text-destructive">{errors.amount.message}</p>
            )}
          </div>

          <Controller
            control={control}
            name="is_active"
            render={({ field }) => (
              <label className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">Ativa</span>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </label>
            )}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
